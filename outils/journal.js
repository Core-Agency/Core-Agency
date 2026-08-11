/* =====================================================================
   JOURNAL DU PROFIL

       node outils/journal.js            (écrit le README)
       node outils/journal.js --essai    (affiche sans rien écrire)

   Relit les dépôts publics de Core et reporte dans le README les
   dernières modifications réellement faites. Rien n'est inventé et rien
   n'est daté à l'heure du passage : le bloc ne change que si le code a
   changé. Une exécution qui ne trouve rien de neuf ne produit donc aucun
   commit — un journal qui se réécrit tout seul chaque semaine pour dire
   la même chose ne serait pas de l'activité, seulement du bruit.

   Aucune dépendance : `fetch` est natif depuis Node 18.
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

const PROPRIETAIRE = "Core-Agency";
const LIGNES = 8;                     // entrées gardées dans le journal
const DEBUT = "<!-- journal:début -->";
const FIN = "<!-- journal:fin -->";

/* Le journal ne se raconte pas lui-même. Sans cette exclusion, le commit
   produit par ce script entrerait dans le tableau, ce qui le ferait
   changer au passage suivant — et ainsi de suite : un commit par semaine
   pour toujours, sans qu'aucun travail réel ait eu lieu. */
const PREFIXE_JOURNAL = "Journal :";

const README = path.join(__dirname, "..", "README.md");
const essai = process.argv.includes("--essai");

const entetes = {
  accept: "application/vnd.github+json",
  "user-agent": "core-agency-journal",
};
if (process.env.GITHUB_TOKEN) entetes.authorization = "Bearer " + process.env.GITHUB_TOKEN;

async function json(route) {
  const r = await fetch("https://api.github.com" + route, { headers: entetes });
  if (!r.ok) throw new Error(route + " → " + r.status + " " + r.statusText);
  return r.json();
}

/* Les dates sont écrites en français, sans heure : le journal parle de
   jours de travail, pas de minutes. */
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
              "août", "septembre", "octobre", "novembre", "décembre"];

function enFrancais(iso) {
  const d = new Date(iso);
  return d.getUTCDate() + " " + MOIS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

/** Le sujet du commit, sans la ligne de détail ni le point final. */
function sujet(message) {
  return String(message).split("\n")[0].replace(/\.$/, "").trim();
}

const echappe = s => String(s).replace(/\|/g, "\\|");

async function main() {
  const depots = await json(`/users/${PROPRIETAIRE}/repos?per_page=100&type=owner&sort=pushed`);

  const publics = depots.filter(d => !d.private && !d.fork && !d.archived);
  const entrees = [];

  for (const depot of publics) {
    let commits;
    try {
      commits = await json(`/repos/${PROPRIETAIRE}/${depot.name}/commits?per_page=5`);
    } catch (e) {
      // Un dépôt vide répond 409 : ce n'est pas une raison d'échouer.
      console.error("  (ignoré) " + depot.name + " : " + e.message);
      continue;
    }
    for (const c of commits) {
      const titre = sujet(c.commit.message);
      if (depot.name === PROPRIETAIRE && titre.startsWith(PREFIXE_JOURNAL)) continue;
      entrees.push({
        depot: depot.name,
        date: c.commit.author.date,
        sujet: titre,
        url: c.html_url,
      });
    }
  }

  entrees.sort((a, b) => new Date(b.date) - new Date(a.date));
  const gardees = entrees.slice(0, LIGNES);

  if (!gardees.length) throw new Error("aucun commit trouvé : on n'écrit rien plutôt qu'un bloc vide");

  const bloc = [
    DEBUT,
    "",
    "| | | |",
    "|---|---|---|",
    ...gardees.map(e =>
      `| ${enFrancais(e.date)} | [\`${e.depot}\`](https://github.com/${PROPRIETAIRE}/${e.depot}) | [${echappe(e.sujet)}](${e.url}) |`),
    "",
    `<sub>Les ${LIGNES} dernières modifications des dépôts publics. Ce tableau est` +
    " reconstruit par [`outils/journal.js`](outils/journal.js) et ne change que" +
    " lorsque le code change.</sub>",
    "",
    FIN,
  ].join("\n");

  const readme = fs.readFileSync(README, "utf8");
  const i = readme.indexOf(DEBUT);
  const j = readme.indexOf(FIN);
  if (i === -1 || j === -1) throw new Error("repères du journal absents du README");

  // Remplacement par découpage plutôt que par `replace` : le sujet d'un
  // commit peut contenir « $& » ou « $1 », que `replace` interpréterait
  // comme des références de capture — la ligne disparaîtrait sans erreur.
  const neuf = readme.slice(0, i) + bloc + readme.slice(j + FIN.length);

  if (neuf === readme) {
    console.log("Rien de neuf : le README reste tel quel.");
    return;
  }

  if (essai) {
    console.log(bloc);
    return;
  }

  fs.writeFileSync(README, neuf, "utf8");
  console.log(`Journal mis à jour : ${gardees.length} entrées, ${publics.length} dépôts relus.`);
}

main().catch(e => { console.error("Échec : " + e.message); process.exit(1); });
