'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";

import { RecargosAuxiliaresTab } from "@/components/recargos/auxiliares-tab";
import { RecargosMedicosTab } from "@/components/recargos/medicos-tab";
import { MedicosSettings } from "@/components/recargos/medicos-settings";
import { useSettingsSidebar } from "@/contexts/settings-sidebar-context";

type RecargosTab = "medicos" | "auxiliares";

export default function Recargos() {
    const [activeTab, setActiveTab] = useState<RecargosTab>("medicos");
    const { setConfig, resetConfig } = useSettingsSidebar();

    useEffect(() => {
        if (activeTab === "medicos") {
            setConfig({
                title: "Ajustes — Médicos",
                description: "Configuración de turnos para recargos de médicos.",
                content: <MedicosSettings />,
            });
        } else {
            setConfig({
                title: "Ajustes — Auxiliares",
                description: "Configuración para recargos de auxiliares.",
                content: null,
            });
        }
        return () => resetConfig();
    }, [activeTab]);

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
            <section className="rounded-xl border bg-card p-6 transition-shadow duration-200 hover:shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            Módulo de Recargos
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">Gestión de Recargos</h1>
                        <p className="mt-2 text-muted-foreground">
                            En construcción. Pronto podrás cargar tus archivos de recargos, visualizarlos y exportarlos en diferentes formatos.
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-lg bg-muted p-1">
                        <Button
                            variant={activeTab === "medicos" ? "default" : "ghost"}
                            onClick={() => setActiveTab("medicos")}
                        >
                            Médicos
                        </Button>
                        <Button
                            variant={activeTab === "auxiliares" ? "default" : "ghost"}
                            onClick={() => setActiveTab("auxiliares")}
                        >
                            Auxiliares
                        </Button>
                    </div>
                </div>
            </section>
            {activeTab === "medicos" ? (
                <RecargosMedicosTab />
            ) : (
                <RecargosAuxiliaresTab />
            )}
        </div>
    );
}
