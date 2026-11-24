// Les métiers que la recherche reconnaît, et les codes d'activité (NAF) officiels qui leur correspondent.
// mots : formes tapées par les visiteurs, sans accents ni majuscules (« plombier », « plomberie »…) ;
// codes : codes NAF envoyés à l'annuaire des entreprises (recherche-entreprises.api.gouv.fr).
export const METIERS = [
  { k: "plomberie", label: "Plomberie", qui: "plombiers", codes: ["43.22A", "43.22B"], mots: ["plombier", "plombiers", "plomberie", "sanitaire", "sanitaires", "salle de bain", "salle de bains", "fuite"] },
  { k: "chauffage", label: "Chauffage, climatisation", qui: "chauffagistes", codes: ["43.22B"], mots: ["chauffagiste", "chauffagistes", "chauffage", "chaudiere", "climatisation", "clim", "climaticien", "pompe a chaleur", "pac", "frigoriste"] },
  { k: "electricite", label: "Électricité", qui: "électriciens", codes: ["43.21A"], mots: ["electricien", "electriciens", "electricite", "elec", "electrique"] },
  { k: "couverture", label: "Couverture", qui: "couvreurs", codes: ["43.91B"], mots: ["couvreur", "couvreurs", "couverture", "toiture", "toit", "zingueur", "zinguerie", "gouttiere", "gouttieres"] },
  { k: "charpente", label: "Charpente", qui: "charpentiers", codes: ["43.91A"], mots: ["charpentier", "charpentiers", "charpente"] },
  { k: "maconnerie", label: "Maçonnerie", qui: "maçons", codes: ["43.99C", "41.20A"], mots: ["macon", "macons", "maconnerie", "gros oeuvre", "gros œuvre", "construction maison", "constructeur"] },
  { k: "menuiserie", label: "Menuiserie", qui: "menuisiers", codes: ["43.32A", "43.32B"], mots: ["menuisier", "menuisiers", "menuiserie", "fenetre", "fenetres", "volet", "volets", "porte", "portes"] },
  { k: "serrurerie", label: "Serrurerie, métallerie", qui: "serruriers", codes: ["43.32B"], mots: ["serrurier", "serruriers", "serrurerie", "metallier", "metallerie", "ferronnier", "ferronnerie"] },
  { k: "peinture", label: "Peinture, vitrerie", qui: "peintres", codes: ["43.34Z"], mots: ["peintre", "peintres", "peinture", "vitrier", "vitrerie", "papier peint"] },
  { k: "platrerie", label: "Plâtrerie, plaquisterie", qui: "plaquistes", codes: ["43.31Z"], mots: ["plaquiste", "plaquistes", "platrier", "platriers", "platrerie", "placo", "cloison", "cloisons"] },
  { k: "carrelage", label: "Carrelage, sols", qui: "carreleurs", codes: ["43.33Z"], mots: ["carreleur", "carreleurs", "carrelage", "parquet", "parqueteur", "sol", "sols", "faience", "revetement de sol"] },
  { k: "isolation", label: "Isolation", qui: "entreprises d'isolation", codes: ["43.29A"], mots: ["isolation", "isolateur", "isolant", "combles"] },
  { k: "terrassement", label: "Terrassement", qui: "terrassiers", codes: ["43.12A", "43.12B"], mots: ["terrassier", "terrassiers", "terrassement", "assainissement", "fosse septique"] },
  { k: "demolition", label: "Démolition", qui: "entreprises de démolition", codes: ["43.11Z"], mots: ["demolition", "desamiantage"] },
  { k: "etancheite", label: "Étanchéité", qui: "étancheurs", codes: ["43.99A"], mots: ["etancheite", "etancheur", "etancheurs", "toit terrasse"] },
  { k: "facade", label: "Façade, ravalement", qui: "façadiers", codes: ["43.99D"], mots: ["facadier", "facadiers", "facade", "facades", "ravalement", "crepi", "enduit"] },
  { k: "paysage", label: "Paysage, jardin", qui: "paysagistes", codes: ["81.30Z"], mots: ["paysagiste", "paysagistes", "jardinier", "jardin", "elagage", "elagueur"] },
  { k: "ramonage", label: "Ramonage", qui: "ramoneurs", codes: ["81.22Z"], mots: ["ramoneur", "ramoneurs", "ramonage"] },
];
export const METIER = Object.fromEntries(METIERS.map((m) => [m.k, m]));
