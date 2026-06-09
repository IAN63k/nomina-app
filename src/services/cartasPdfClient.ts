/**
 * Conversión de cartas .docx a PDF **en el navegador** (sin servidor).
 *
 * En producción (Vercel/serverless) no hay LibreOffice, así que el PDF se genera
 * en el cliente: el .docx ya combinado se renderiza con `docx-preview` en un
 * contenedor oculto y cada página se captura a un PDF con `html2canvas-pro`
 * (soporta los colores `oklch` de Tailwind v4) + `jsPDF`.
 *
 * Las librerías se importan dinámicamente para no engordar el bundle inicial:
 * solo se cargan cuando el usuario pide un PDF.
 */

// 96 px CSS por pulgada → 72 pt por pulgada.
const PX_TO_PT = 72 / 96;
// Escala de render: 2 = más nitidez (canvas al doble de resolución).
const SCALE = 2;

type Libs = {
  renderAsync: typeof import("docx-preview").renderAsync;
  jsPDF: typeof import("jspdf").jsPDF;
  html2canvas: typeof import("html2canvas-pro").default;
};

let libsPromise: Promise<Libs> | null = null;

function loadLibs(): Promise<Libs> {
  if (!libsPromise) {
    libsPromise = Promise.all([
      import("docx-preview"),
      import("jspdf"),
      import("html2canvas-pro"),
    ]).then(([docxPreview, jspdf, html2canvas]) => ({
      renderAsync: docxPreview.renderAsync,
      jsPDF: jspdf.jsPDF,
      html2canvas: html2canvas.default,
    }));
  }
  return libsPromise;
}

/** Convierte los bytes de un .docx en un Blob PDF, página a página. */
export async function docxToPdf(docx: Uint8Array): Promise<Blob> {
  const { renderAsync, jsPDF, html2canvas } = await loadLibs();

  // Contenedor oculto y aislado: color/fondo explícitos para no heredar estilos
  // globales y que el render del docx mande.
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;background:#ffffff;color:#000000;z-index:-1;";
  document.body.appendChild(container);

  try {
    await renderAsync(new Blob([docx as unknown as BlobPart]), container, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
    });

    // Cada página del documento es un <section> dentro del wrapper.
    const sections = Array.from(container.querySelectorAll<HTMLElement>("section"));
    const pages = sections.length > 0 ? sections : [container];

    let pdf: InstanceType<typeof jsPDF> | null = null;
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: SCALE,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });
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
    container.remove();
  }
}
