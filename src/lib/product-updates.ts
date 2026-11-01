// Verified against accounting-automation main at 62bb0f1062a143e8bc72280252190d36438f5e21.
// Dates describe development changes, not the availability of a Windows release.
export const productUpdates = [
  {
    id: "scanare-in-fundal",
    date: "2026-10-30",
    dateLabel: "30 octombrie 2026",
    category: "ÎNCĂRCARE",
    title: "Scanarea continuă în fundal.",
    summary: "Folderele cu declarații sunt citite în fundal, cu progres afișat, pentru ca interfața să rămână disponibilă în timpul căutării.",
    details: [
      "Sunt incluse atât folderul sursă comun, cât și folderele dedicate firmelor. Poți închide fereastra pentru a opri scanarea.",
      "Conectarea la Chrome și așteptarea răspunsului la trimitere au limite de timp. Dacă ANAF nu confirmă la timp, primești un mesaj care îți cere să verifici în Chrome înainte de a retrimite.",
    ],
  },
  {
    id: "folder-arhiva",
    date: "2026-10-28",
    dateLabel: "28 octombrie 2026",
    category: "ARHIVĂ",
    title: "Documentele, în folderul ales de tine.",
    summary: "Alegi la prima pornire unde păstrezi declarațiile și recipisele. Poți schimba ulterior locul arhivei direct din aplicație.",
    details: [
      "Opțiunea „Folder arhivă” este disponibilă în bara laterală și în bara de instrumente.",
      "La schimbarea folderului, poți muta și documentele deja arhivate, păstrând organizarea pe firmă, an, lună și tip de declarație.",
      "Arhiva se păstrează separat de folderul sursă din care trimiți declarațiile, pentru a nu include copiile arhivate la următoarea scanare.",
    ],
  },
  {
    id: "declaratii-si-rectificative",
    date: "2026-10-25",
    dateLabel: "25 octombrie 2026",
    category: "DECLARAȚII",
    title: "D100 și D710, în același context.",
    summary: "Rectificativa D710 apare alături de D100, cu propria recipisă și stare. Trimiterile anterioare și erorile sunt mai ușor de urmărit.",
    details: [
      "În matrice, D710 este afișată în celula D100, cu marcajul „Rectificată”. Dialogul lunii păstrează declarația inițială și rectificativa, fiecare cu recipisa, indexul și starea ei.",
      "Pentru familia D100, aplicația citește conținutul PDF-ului pentru a deosebi declarația inițială de rectificativa D710.",
      "Fișierele identice deja trimise, validate sau în prelucrare, sunt ascunse implicit. Le poți afișa din nou. Declarațiile respinse și depunerile noi pentru o perioadă deja depusă apar nebifate, cu explicații în „Observații”.",
      "Fereastra „Rezultat trimitere” arată rezultatul fiecărui document și textul complet al erorilor. Poți copia o eroare sau toate erorile; detaliile rămân disponibile și în dialogul lunii.",
    ],
  },
  {
    id: "model-excel",
    date: "2026-10-25",
    dateLabel: "25 octombrie 2026",
    category: "IMPORT EXCEL",
    title: "Un model Excel gata de completat.",
    summary: "Importul firmelor pornește de la un model gol, cu coloanele recunoscute de aplicație, liste derulante și instrucțiuni.",
    details: [
      "Din „Importă din Excel”, alege „Descarcă modelul Excel”. Completezi denumirea firmei, CUI-ul, periodicitatea TVA și declarațiile aplicabile.",
      "Modelul include coloana „D100 + D710”, opțiuni pentru periodicitate și bife, plus o foaie de instrucțiuni. Importul recunoaște și coloanele D100 din fișierele existente.",
    ],
  },
] as const;
