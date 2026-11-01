export const workflowStages = [
  {
    id: "matrix-title",
    label: "01 / ORGANIZARE",
    shortLabel: "Organizare",
    title: "Toate declarațiile. Un singur loc.",
    description: "Organizează firmele și declarațiile într-o interfață clară, construită pentru eficiență.",
    detail: "Import Excel · declarații · rectificative",
  },
  {
    id: "upload-title",
    label: "02 / ÎNCĂRCARE",
    shortLabel: "Trimitere D112",
    title: "Trimiți declarațiile. Fără pași inutili.",
    description: "Gestionează transmiterea declarațiilor către ANAF dintr-un singur flux de lucru.",
    detail: "Scanare · verificare · trimitere",
  },
  {
    id: "receipt-title",
    label: "03 / VERIFICARE",
    shortLabel: "Recipisă",
    title: "Rezultatul. La vedere.",
    description: "Verifică starea declarațiilor și consultă recipisele într-un mod simplu și organizat.",
    detail: "Verificare · rezultat · arhivă",
  },
] as const;
