/**
 * Conversión de cartas .docx a PDF **en el navegador** (sin servidor).
 *
 * En producción (Vercel/serverless) no hay LibreOffice, así que el PDF se genera
 * en el cliente: el .docx ya combinado se renderiza con `docx-preview` en un
 * contenedor oculto y cada página se rasteriza con `html-to-image` + `jsPDF`.
 *
 * Se usa `html-to-image` (SVG foreignObject) y NO html2canvas: foreignObject
 * delega el render al **motor del propio navegador**, por lo que respeta
 * fielmente el documento (encabezado/logo, cuerpo, firma y pie). html2canvas
 * reimplementa el render y perdía partes (cuerpo o encabezado/pie). Para que
 * foreignObject pueda incrustar las imágenes, `docx-preview` se invoca con
 * `useBase64URL: true` (imágenes embebidas como data URL).
 *
 * Las librerías se importan dinámicamente para no engordar el bundle inicial.
 */

// 96 px CSS por pulgada → 72 pt por pulgada.
const PX_TO_PT = 72 / 96;
// Resolución de render: 2 = nitidez (canvas al doble de píxeles CSS).
const SCALE = 2;

type Libs = {
  renderAsync: typeof import("docx-preview").renderAsync;
  jsPDF: typeof import("jspdf").jsPDF;
  toCanvas: typeof import("html-to-image").toCanvas;
};

let libsPromise: Promise<Libs> | null = null;

function loadLibs(): Promise<Libs> {
  if (!libsPromise) {
    libsPromise = Promise.all([
      import("docx-preview"),
      import("jspdf"),
      import("html-to-image"),
    ]).then(([docxPreview, jspdf, htmlToImage]) => ({
      renderAsync: docxPreview.renderAsync,
      jsPDF: jspdf.jsPDF,
      toCanvas: htmlToImage.toCanvas,
    }));
  }
  return libsPromise;
}

/**
 * Renderiza un .docx para **previsualizarlo en pantalla** dentro de un iframe.
 * Se usa un iframe (igual que en el PDF) para que el CSS global de la app no se
 * filtre y la carta se vea fiel (encabezado, firma en línea y pie). docx-preview
 * dibuja sus propias páginas con sombra sobre fondo gris (inWrapper).
 */
export async function renderDocxInIframe(
  docx: Uint8Array,
  iframe: HTMLIFrameElement
): Promise<void> {
  const { renderAsync } = await loadLibs();

  const idoc = iframe.contentDocument;
  if (!idoc) throw new Error("No se pudo acceder al marco de previsualización.");

  idoc.open();
  idoc.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
      '<body style="margin:0;background:#f1f5f9;color:#000000;"></body></html>'
  );
  idoc.close();

  await renderAsync(new Blob([docx as unknown as BlobPart]), idoc.body, undefined, {
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    breakPages: true,
    useBase64URL: true,
  });

  if (idoc.fonts?.ready) await idoc.fonts.ready;
}

/** Convierte los bytes de un .docx en un Blob PDF, página a página. */
export async function docxToPdf(docx: Uint8Array): Promise<Blob> {
  const { renderAsync, jsPDF, toCanvas } = await loadLibs();

  // Render dentro de un iframe AISLADO: así el CSS global de la app (Tailwind,
  // resets…) no se filtra y no altera la captura de los elementos posicionados
  // en absoluto del documento (encabezado/logo y pie de página).
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:900px;height:1400px;border:0;background:#ffffff;";
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument!;
  idoc.open();
  idoc.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
      '<body style="margin:0;background:#ffffff;color:#000000;"></body></html>'
  );
  idoc.close();
  const container = idoc.body;

  try {
    await renderAsync(new Blob([docx as unknown as BlobPart]), container, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      useBase64URL: true, // imágenes como data URL → incrustables por foreignObject
    });

    // Esperar fuentes (y un instante para que el layout/imagenes se asienten).
    if (idoc.fonts?.ready) await idoc.fonts.ready;
    await new Promise((r) => setTimeout(r, 150));

    // Cada página del documento es un <section> dentro del wrapper.
    const sections = Array.from(container.querySelectorAll<HTMLElement>("section"));
    const pages = sections.length > 0 ? sections : [container];

    let pdf: InstanceType<typeof jsPDF> | null = null;
    for (let i = 0; i < pages.length; i++) {
      const el = pages[i];
      // overflow visible + ancho/alto reales (scroll*) para no recortar elementos
      // que se salen de la caja (p. ej. el logo pegado al margen derecho).
      el.style.overflow = "visible";
      const w = Math.max(el.scrollWidth, el.offsetWidth);
      const h = Math.max(el.scrollHeight, el.offsetHeight);
      const canvas = await toCanvas(el, {
        pixelRatio: SCALE,
        backgroundColor: "#ffffff",
        width: w,
        height: h,
      });
      // Dimensiones del PDF derivadas del canvas para no distorsionar.
      const wpt = (canvas.width / SCALE) * PX_TO_PT;
      const hpt = (canvas.height / SCALE) * PX_TO_PT;
      const img = canvas.toDataURL("image/jpeg", 0.95);

      if (!pdf) {
        pdf = new jsPDF({ unit: "pt", format: [wpt, hpt], compress: true });
      } else {
        pdf.addPage([wpt, hpt]);
      }
      pdf.addImage(img, "JPEG", 0, 0, wpt, hpt);
    }

    if (!pdf) throw new Error("El documento no produjo ninguna página.");
    return pdf.output("blob");
  } finally {
    iframe.remove();
  }
}
