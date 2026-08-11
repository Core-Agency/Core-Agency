/* =====================================================================
   GRAPHIQUES DU PROFIL

       node outils/graphiques.js

   Produit assets/activite.svg et assets/langages.svg à partir des
   données réelles du compte.

   Pourquoi les dessiner nous-mêmes plutôt que d'appeler un service qui
   rend des cartes toutes faites : parce que ces services sont des
   dépendances. Le jour où l'un d'eux tombe, est limité en débit ou
   ferme, le profil affiche un cadre cassé — et c'est exactement ce que
   la maison reproche aux constructeurs de pages. Ici, les SVG sont des
   fichiers du dépôt. Ils ne dépendent de rien.

   Les deux images doivent tenir sur fond clair ET sur fond sombre :
   GitHub rend le README dans le thème du visiteur. Les couleurs sont
   donc choisies pour passer sur les deux SANS média query — voir la
   note sur la case vide plus bas, qui explique pourquoi
   `prefers-color-scheme` ne peut pas servir ici.

   Aucune dépendance : `fetch` est natif depuis Node 18.
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

const PROPRIETAIRE = "Core-Agency";
const ASSETS = path.join(__dirname, "..", "assets");

const entetes = {
  accept: "application/vnd.github+json",
  "user-agent": "core-agency-graphiques",
};
if (process.env.GITHUB_TOKEN) entetes.authorization = "Bearer " + process.env.GITHUB_TOKEN;

async function rest(route) {
  const r = await fetch("https://api.github.com" + route, { headers: entetes });
  if (!r.ok) throw new Error(route + " → " + r.status + " " + r.statusText);
  return r.json();
}

async function graphql(query, variables) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: Object.assign({}, entetes, { "content-type": "application/json" }),
    body: JSON.stringify({ query, variables }),
  });
  const corps = await r.json();
  if (corps.errors) throw new Error(corps.errors.map(e => e.message).join(" ; "));
  return corps.data;
}

/* ------------------------------------------------------------------
   PALETTE

   Le violet de la maison, décliné en cinq paliers. Le palier zéro est
   la seule couleur qui ne peut pas convenir aux deux thèmes : elle est
   traitée par `prefers-color-scheme`.
   ------------------------------------------------------------------ */

const PALIERS = ["#C3BAF2", "#A192EC", "#7F6DE6", "#6355E0", "#4A3CC0"];
const ENCRE_DOUCE = "#8B8B99";        // lisible sur blanc comme sur #0d1117

/* La case vide est le seul ton réellement difficile : clair sur fond
   blanc, sombre sur fond noir. On ne peut PAS s'en remettre à
   `prefers-color-scheme` — dans un SVG chargé en <img>, cette règle suit
   le thème du NAVIGATEUR, alors que GitHub laisse choisir un thème dans
   l'application. Quelqu'un dont le système est en clair et GitHub en
   sombre verrait un mur de carrés blancs.
   Un gris semi-transparent résout les deux cas d'un coup : posé sur du
   blanc il s'assombrit, posé sur du noir il s'éclaircit. */
const VIDE = 'fill="#6B6B7A" fill-opacity="0.22"';

const echappe = s => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ==================================================================
   1. ACTIVITÉ — le calendrier des contributions
   ================================================================== */

const MOIS_COURT = ["jan", "fév", "mar", "avr", "mai", "juin",
                    "juil", "août", "sep", "oct", "nov", "déc"];

async function activite() {
  const data = await graphql(`
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              firstDay
              contributionDays { date contributionCount weekday }
            }
          }
        }
      }
    }`, { login: PROPRIETAIRE });

  const cal = data.user.contributionsCollection.contributionCalendar;
  const semaines = cal.weeks;

  // Les paliers sont relatifs au meilleur jour : un compte qui fait
  // trois commits par jour ne doit pas paraître éteint sous prétexte
  // qu'un autre en fait trente.
  const max = Math.max(1, ...semaines.flatMap(s => s.contributionDays.map(j => j.contributionCount)));
  const palier = n => {
    if (n === 0) return -1;
    return Math.min(4, Math.floor((n - 1) / Math.max(1, max / 4)));
  };

  const COTE = 11, ECART = 3, PAS = COTE + ECART;
  const MARGE_G = 30, MARGE_H = 22;
  const largeur = MARGE_G + semaines.length * PAS + 6;
  const hauteur = MARGE_H + 7 * PAS + 22;

  const cases = [];
  const etiquettesMois = [];
  let moisPrecedent = null;

  semaines.forEach((semaine, x) => {
    const premier = new Date(semaine.firstDay);
    const mois = premier.getUTCMonth();
    // On n'étiquette qu'au changement de mois, et jamais deux colonnes
    // de suite : sinon les libellés se chevauchent.
    if (mois !== moisPrecedent && premier.getUTCDate() <= 7) {
      etiquettesMois.push(
        `<text x="${MARGE_G + x * PAS}" y="${MARGE_H - 8}" class="l">${MOIS_COURT[mois]}</text>`);
      moisPrecedent = mois;
    }

    semaine.contributionDays.forEach(jour => {
      const y = MARGE_H + jour.weekday * PAS;
      const p = palier(jour.contributionCount);
      const remplissage = p === -1 ? VIDE : `fill="${PALIERS[p]}"`;
      const titre = `${jour.contributionCount} le ${jour.date}`;
      cases.push(
        `<rect x="${MARGE_G + x * PAS}" y="${y}" width="${COTE}" height="${COTE}" rx="2.5" ${remplissage}><title>${echappe(titre)}</title></rect>`);
    });
  });

  // Jours de la semaine : un sur deux, pour ne pas encombrer.
  const jours = [["lun", 1], ["mer", 3], ["ven", 5]].map(([nom, i]) =>
    `<text x="0" y="${MARGE_H + i * PAS + 9}" class="l">${nom}</text>`);

  // Légende « moins → plus », comme sur GitHub.
  const baseLegende = largeur - 6 - (5 * PAS + 62);
  const yLegende = hauteur - 12;
  const legende = [
    `<text x="${baseLegende}" y="${yLegende + 9}" class="l">moins</text>`,
    `<rect x="${baseLegende + 34}" y="${yLegende}" width="${COTE}" height="${COTE}" rx="2.5" ${VIDE}/>`,
    ...PALIERS.map((c, i) =>
      `<rect x="${baseLegende + 34 + (i + 1) * PAS}" y="${yLegende}" width="${COTE}" height="${COTE}" rx="2.5" fill="${c}"/>`),
    `<text x="${baseLegende + 34 + 6 * PAS + 4}" y="${yLegende + 9}" class="l">plus</text>`,
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}" role="img" aria-label="${cal.totalContributions} contributions sur les douze derniers mois">
<style>
  .l { font: 9px 'Lexend Deca', -apple-system, 'Segoe UI', Roboto, sans-serif; fill: ${ENCRE_DOUCE}; }
  .t { font: 600 11px 'Lexend Deca', -apple-system, 'Segoe UI', Roboto, sans-serif; fill: ${ENCRE_DOUCE}; }
</style>
<title>${cal.totalContributions} contributions sur les douze derniers mois</title>
${etiquettesMois.join("\n")}
${jours.join("\n")}
${cases.join("\n")}
${legende.join("\n")}
</svg>`;

  fs.writeFileSync(path.join(ASSETS, "activite.svg"), svg, "utf8");
  return { total: cal.totalContributions, semaines: semaines.length, max };
}

/* ==================================================================
   2. LANGAGES — ce que pèsent réellement les dépôts publics
   ================================================================== */

/* Couleurs officielles de GitHub Linguist pour les langages qu'on
   emploie. Un langage inconnu retombe sur le violet de la maison. */
const COULEUR_LANGAGE = {
  JavaScript: "#F1E05A",
  CSS: "#663399",
  HTML: "#E34C26",
  Python: "#3572A5",
  Kotlin: "#A97BFF",
  Shell: "#89E051",
  PowerShell: "#012456",
  TypeScript: "#3178C6",
  SCSS: "#C6538C",
};

async function langages() {
  const depots = await rest(`/users/${PROPRIETAIRE}/repos?per_page=100&type=owner`);
  const publics = depots.filter(d => !d.private && !d.fork && !d.archived);

  const total = {};
  for (const depot of publics) {
    let compte;
    try { compte = await rest(`/repos/${PROPRIETAIRE}/${depot.name}/languages`); }
    catch { continue; }
    for (const [langue, octets] of Object.entries(compte)) {
      total[langue] = (total[langue] || 0) + octets;
    }
  }

  const somme = Object.values(total).reduce((a, b) => a + b, 0);
  if (!somme) throw new Error("aucun langage détecté");

  const classe = Object.entries(total)
    .sort((a, b) => b[1] - a[1])
    .map(([langue, octets]) => ({
      langue,
      part: octets / somme,
      couleur: COULEUR_LANGAGE[langue] || "#6355E0",
    }));

  const LARGEUR = 720, BARRE = 10, RAYON = 5;
  const yLegende = BARRE + 24;
  const hauteur = yLegende + 14;

  // Barre empilée. Les coins sont arrondis par un masque plutôt que par
  // `rx` sur chaque segment : sinon chaque segment s'arrondit, et la
  // barre ressemble à un chapelet.
  let x = 0;
  const segments = classe.map(l => {
    const w = Math.max(1, l.part * LARGEUR);
    const seg = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${BARRE}" fill="${l.couleur}"><title>${echappe(l.langue)} ${(l.part * 100).toFixed(1)} %</title></rect>`;
    x += w;
    return seg;
  });

  // Légende sur une ligne, répartie régulièrement.
  const pas = LARGEUR / Math.min(classe.length, 6);
  const legende = classe.slice(0, 6).map((l, i) => {
    const lx = i * pas;
    return `<circle cx="${lx + 4}" cy="${yLegende - 4}" r="4" fill="${l.couleur}"/>` +
           `<text x="${lx + 14}" y="${yLegende}" class="l">${echappe(l.langue)} ` +
           `<tspan class="p">${(l.part * 100).toFixed(1)} %</tspan></text>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${hauteur}" viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="Répartition des langages des dépôts publics">
<style>
  .l { font: 10px 'Lexend Deca', -apple-system, 'Segoe UI', Roboto, sans-serif; fill: ${ENCRE_DOUCE}; }
  .p { font-weight: 600; }
</style>
<title>Répartition des langages des dépôts publics</title>
<defs><clipPath id="arrondi"><rect x="0" y="0" width="${LARGEUR}" height="${BARRE}" rx="${RAYON}"/></clipPath></defs>
<g clip-path="url(#arrondi)">
${segments.join("\n")}
</g>
${legende.join("\n")}
</svg>`;

  fs.writeFileSync(path.join(ASSETS, "langages.svg"), svg, "utf8");
  return { langues: classe.length, tete: classe.slice(0, 3).map(l => `${l.langue} ${(l.part * 100).toFixed(1)} %`) };
}

/* ================================================================== */

async function main() {
  fs.mkdirSync(ASSETS, { recursive: true });
  const a = await activite();
  console.log(`activite.svg : ${a.total} contributions, ${a.semaines} semaines, pointe à ${a.max}/jour`);
  const l = await langages();
  console.log(`langages.svg : ${l.langues} langages — ${l.tete.join(", ")}`);
}

main().catch(e => { console.error("Échec : " + e.message); process.exit(1); });
