"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ImporterView, SupplierView } from "@bandari/shared";
import { api } from "@/lib/api";

export type Role = "importer" | "exporter" | "ops";

export const ROLE_HOME: Record<Role, string> = {
  importer: "/importer",
  exporter: "/exporter",
  ops: "/",
};

interface PersonaContextValue {
  role: Role;
  importerId: string;
  supplierId: string;
  ready: boolean;
  importers: ImporterView[];
  suppliers: SupplierView[];
  importer?: ImporterView;
  supplier?: SupplierView;
  setRole: (r: Role) => void;
  setImporterId: (id: string) => void;
  setSupplierId: (id: string) => void;
  reload: () => Promise<void>;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);
const LS_KEY = "bandari.persona";

function loadSaved(): { role?: Role; importerId?: string; supplierId?: string } {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("importer");
  const [importerId, setImporterIdState] = useState("");
  const [supplierId, setSupplierIdState] = useState("");
  const [importers, setImporters] = useState<ImporterView[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierView[]>([]);
  const [ready, setReady] = useState(false);

  function persist(next: { role?: Role; importerId?: string; supplierId?: string }) {
    if (typeof window === "undefined") return;
    const merged = { role, importerId, supplierId, ...next };
    window.localStorage.setItem(LS_KEY, JSON.stringify(merged));
  }

  const reload = useCallback(async () => {
    const [imps, sups] = await Promise.all([api().listImporters(), api().listSuppliers()]);
    setImporters(imps);
    setSuppliers(sups);
  }, []);

  useEffect(() => {
    const saved = loadSaved();
    (async () => {
      let imps: ImporterView[] = [];
      let sups: SupplierView[] = [];
      try {
        [imps, sups] = await Promise.all([api().listImporters(), api().listSuppliers()]);
      } catch {
        // API not up yet; fall back to defaults so the shell still renders.
      }
      setImporters(imps);
      setSuppliers(sups);
      setRoleState(saved.role ?? "importer");
      setImporterIdState(
        saved.importerId && imps.some((i) => i.id === saved.importerId)
          ? saved.importerId
          : (imps[0]?.id ?? ""),
      );
      setSupplierIdState(
        saved.supplierId && sups.some((s) => s.id === saved.supplierId)
          ? saved.supplierId
          : (sups[0]?.id ?? ""),
      );
      setReady(true);
    })();
  }, []);

  const setRole = (r: Role) => {
    setRoleState(r);
    persist({ role: r });
  };
  const setImporterId = (id: string) => {
    setImporterIdState(id);
    persist({ importerId: id });
  };
  const setSupplierId = (id: string) => {
    setSupplierIdState(id);
    persist({ supplierId: id });
  };

  const value: PersonaContextValue = {
    role,
    importerId,
    supplierId,
    ready,
    importers,
    suppliers,
    importer: importers.find((i) => i.id === importerId),
    supplier: suppliers.find((s) => s.id === supplierId),
    setRole,
    setImporterId,
    setSupplierId,
    reload,
  };

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error("usePersona must be used within a PersonaProvider");
  return ctx;
}
