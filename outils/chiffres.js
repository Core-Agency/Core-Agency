/* =====================================================================
   LES CHIFFRES DE LA VITRINE

       node outils/chiffres.js            (écrit le README)
       node outils/chiffres.js --essai    (affiche sans rien écrire)

   Le profil annonçait « Sept outils publics » et « 327 contrôles
   automatisés ». Ces deux nombres étaient écrits à la main : le jour où
   un huitième outil sort, ou bien où un harnais gagne dix contrôles, la
   vitrine ment sans que personne ne s'en aperçoive. Rien n'est plus
   coûteux qu'un chiffre faux affiché avec aplomb.

   Ils se déduisent désormais de la réalité :
     - le nombre d'outils, des dépôts publics servis par GitHub Pages ;
     - le total des contrôles, du badge que chaque README porte déjà.

   Le badge est la source : c'est lui que le lecteur voit sur le dépôt,
   et il est mis à jour par la personne qui touche au harnais.

   Aucune dépendance : `fetch` est natif depuis Node 18.
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

const PROPRIETAIRE = "Core-Agency";
const DEBUT = "<!-- chiffres:début -->";
const FIN = "<!-- chiffres:fin -->";

const README = path.join(__dirname, "..", "README.md");
const essai = process.argv.includes("--essai");

const entetes = {
  accept: "application/vnd.github+json",
  "user-agent": "core-agency-chiffres",
};
if (process.env.GITHUB_TOKEN) entetes.authorization = "Bearer " + process.env.GITHUB_TOKEN;

async function json(route) {
  const r = await fetch("https://api.github.com" + route, { headers: entetes });
  if (!r.ok) throw new Error(route + " → " + r.status + " " + r.statusText);
  return r.json();
}

const EN_LETTRES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six",
                    "sept", "huit", "neuf", "dix", "onze", "douze"];
const enLettres = n => EN_LETTRES[n] || String(n);

/**
 * Le nombre de contrôles annoncé par le badge du README.
 * Le libellé est encodé pour une URL : « contrôles%20automatisés-218- ».
 */
function controlesDuBadge(readme) {
  const m = /contr%C3%B4les%20automatis%C3%A9s-(\d+)-/.exec(readme)
         || /contrôles%20automatisés-(\d+)-/.exec(readme);
  return m ? Number(m[1]) : 0;
}

async function main() {
  const depots = await json(`/users/${PROPRIETAIRE}/repos?per_page=100&type=owner`);

  // Un « outil » est un dépôt public servi par Pages : c'est ce qui a une
  // démo qu'on peut ouvrir. Le dépôt de profil n'en est pas un.
  const outils = depots.filter(d =>
    !d.private && !d.fork && !d.archived && d.has_pages && d.name !== PROPRIETAIRE);

  let total = 0;
  const detail = [];

  for (const outil of outils) {
    let readme = "";
    try {
      const r = await json(`/repos/${PROPRIETAIRE}/${outil.name}/readme`);
      readme = Buffer.from(r.content, "base64").toString("utf8");
    } catch { /* pas de README : zéro contrôle annoncé */ }
    const n = controlesDuBadge(readme);
    total += n;
    detail.push(`${outil.name} : ${n}`);
  }

  if (!outils.length) throw new Error("aucun outil trouvé : on n'écrit rien plutôt qu'un chiffre faux");

  // Tous les outils ne portent pas de harnais : les quatre premiers sont
  // antérieurs à cette habitude. Écrire « chacun porte le sien » serait
  // faux, et c'est exactement le genre de phrase qu'on n'écrit qu'une
  // fois puis qu'on ne relit jamais.
  const armes = detail.filter(d => !d.endsWith(": 0")).length;
  const combien = armes === outils.length
    ? "Chacun porte un harnais de vérification"
    : `${enLettres(armes).replace(/^./, c => c.toUpperCase())} d'entre eux portent un harnais de vérification`;

  const bloc = [
    DEBUT,
    "",
    `${enLettres(outils.length).replace(/^./, c => c.toUpperCase())} outils publics, ` +
    "tous écrits selon la même règle : **aucune dépendance,",
    "aucune requête réseau, aucun compte.** Ce sont les instruments que nous",
    "sortons pendant un chantier — un QR code à produire, un contraste à trancher,",
    "une facture à éditer. Ils sont ouverts parce qu'ils servent à d'autres.",
    "",
    `Chacun sort d'un besoin réel rencontré chez un client. ${combien} :`,
    `**${total} contrôles automatisés** au total, rejoués sur trois versions de Node`,
    "à chaque modification.",
    "",
    FIN,
  ].join("\n");

  const readme = fs.readFileSync(README, "utf8");
  const i = readme.indexOf(DEBUT);
  const j = readme.indexOf(FIN);
  if (i === -1 || j === -1) throw new Error("repères des chiffres absents du README");

  const neuf = readme.slice(0, i) + bloc + readme.slice(j + FIN.length);

  if (essai) {
    console.log(bloc);
    console.log("\ndétail : " + detail.join(" · "));
    console.log(neuf === readme
      ? "→ identique au README actuel : aucun commit ne serait produit."
      : "→ le README serait modifié.");
    return;
  }

  if (neuf === readme) {
    console.log(`Chiffres inchangés : ${outils.length} outils, ${total} contrôles.`);
    return;
  }

  fs.writeFileSync(README, neuf, "utf8");
  console.log(`Chiffres mis à jour : ${outils.length} outils, ${total} contrôles.`);
  console.log("détail : " + detail.join(" · "));
}

main().catch(e => { console.error("Échec : " + e.message); process.exit(1); });
