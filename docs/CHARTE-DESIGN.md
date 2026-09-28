# Charte de design — TSITA GEST × BSCA Bank

> Version 1.0 · 28 septembre 2026 · Phase 1 (design UX/UI)
> Sources : `docs/maquette-reference.html` (maquette BSCA V1 validée), `docs/cahier-des-charges-v4.txt` §2 et §6, `docs/ARCHITECTURE.md` §10.
> Mise en œuvre de référence : `guide-interactif/css/guide.css` et, pour l'application, `frontend/src/styles/tokens.css` + `components.css` (phase 2 appliquée).
> Destinataires : front-end (passe de finition UX en phase 2), back-end (libellés, formats), recette visuelle.

Les codes couleur BSCA sont relevés visuellement sur les logos transmis : **ils restent à confirmer officiellement par BSCA** (CDC §2).

---

## 1. Principes UX

| Principe | Ce que cela veut dire concrètement |
|---|---|
| **Clarté d'abord** | Un écran = une tâche principale, un seul bouton rouge (action primaire). Libellés métier en français courant (« Réponse envoyée », pas `reponse_envoyee`). La « prochaine action » est toujours affichée sur un dossier. |
| **Traçabilité visible** | Toute action qui modifie un dossier demande un motif, et l'utilisateur voit où elle sera consignée (chronologie, audit). Les dates affichent le fuseau quand il compte (échéances). Chaque indicateur affiche période, date de calcul et définition. |
| **Séparation client / interne** | Tout ce qui est interne porte un marqueur constant : fond ambre clair + icône cadenas + mot « interne ». Le choix « Message au client » / « Note interne » est explicite, jamais implicite. Le portail client n'utilise que le statut client (ARCHITECTURE §6). |
| **Jamais la couleur seule** | Tout état = **mot + icône + couleur** (et forme de badge). Le rouge de marque ne veut pas dire « en retard ». |
| **Honnêteté des données** | Données fictives signalées ; règle de délai non validée signalée par un bandeau ; montant inconnu affiché « Inconnu » (jamais 0) ; tout montant avec sa devise. |
| **Réversible ou confirmé** | Une action irréversible (envoi au client, validation N2, validation de règle) passe par une modale de confirmation qui résume l'effet. Aucune suppression de dossier n'est proposée aux profils métier. |
| **Accessible par défaut** | WCAG 2.2 AA : clavier complet, focus visible, contrastes calculés (§2.4), lisible à 200 %, cibles ≥ 24 × 24 px (44 px recommandés sur mobile). |

---

## 2. Couleurs

### 2.1 Jetons de marque et neutres

| Jeton CSS | Valeur | Usage | Contraste sur blanc | Sur fond `#F5F7FA` |
|---|---|---|---|---|
| `--red` | `#D9132C` | Action principale, onglet actif (filet), accent de marque, eyebrow | **5,15:1** AA | 4,80:1 AA |
| `--red-deep` | `#A60E22` | Survol du bouton rouge, texte rouge sur fond clair teinté | 7,76:1 AAA | 7,23:1 |
| `--blue` | `#0B509A` | Liens, navigation secondaire, graphiques neutres, badges info | 7,99:1 AAA | 7,44:1 |
| `--navy` | `#12395E` | Texte fort, boutons secondaires (texte), héros (départ du dégradé) | 11,85:1 | 11,04:1 |
| `--side` | `#102F50` | Barre latérale, liseré de focus | 13,60:1 | 12,67:1 |
| `--ink` | `#172637` | Corps de texte | 15,34:1 | 14,29:1 |
| `--muted` | `#5A6B7B` | Texte secondaire, légendes, en-têtes de tableau | 5,49:1 AA | 5,12:1 AA |
| `--bg` | `#F5F7FA` | Fond des pages | — | — |
| `--line` | `#DDE4EC` | Bordures de cartes et séparateurs **décoratifs** | 1,28:1 (décoratif) | 1,19:1 |
| `--field-line` | `#7D8FA3` | **Bordure des champs** de formulaire (composant d'interface) | 3,32:1 ≥ 3:1 | 3,09:1 |
| `--white` | `#FFFFFF` | Cartes, bandeau du logo | — | — |
| `--focus` | `#F4B841` | Anneau de focus (toujours doublé du liseré `--side`) | 1,78:1 seul ⚠ | — |

> **Écart constaté et corrigé** : la maquette utilise `#CBD7E2` pour les bordures de champs (1,46:1), insuffisant pour WCAG 1.4.11. Utiliser `--field-line: #7D8FA3` (3,32:1). `--line` reste réservé aux cartes/séparateurs.

### 2.2 États fonctionnels (texte sur fond teinté)

| État | Texte | Fond | Bordure | Ratio texte/fond | Usage |
|---|---|---|---|---|---|
| Attention | **`--warn-text: #8F5300`** | `#FFF3DE` | `#F1D7A6` | **5,62:1** AA | À risque, validation en attente, règle de démonstration, note interne |
| (icône/trait ambre) | `--warn: #AF6500` | — | — | 4,48:1 sur blanc | Icônes, traits, grands textes ≥ 24 px uniquement |
| Erreur / retard | `#B42332` | `#FCEAED` | `#F2C4CB` | 5,62:1 AA | En retard, action bloquée, erreur |
| Succès | `#11734D` | `#E9F6EF` | `#BFE3CF` | 5,27:1 AA | Répondu, dans les délais, action terminée |
| Information | `#0B509A` (ou `#244D74`) | `#EDF4FB` | `#D3E2F1` | 7,20:1 (7,93:1) | Statuts informatifs, aides, encarts |

> **Écart constaté et corrigé** : `#AF6500` sur `#FFF3DE` ne donne que **4,08:1** (échec AA pour du texte courant). Tout texte ambre de taille normale utilise `--warn-text: #8F5300`. La maquette utilisait déjà `#915C13` / `#87521A` (≥ 5,1:1) dans ses badges : ces valeurs sont compatibles.

### 2.3 Barre latérale et héros

| Paire | Ratio |
|---|---|
| Texte nav `#C7D9E9` sur `#102F50` | 9,41:1 |
| Texte nav actif `#FFFFFF` sur `#274E73` | 8,66:1 |
| Titres de section nav `#A9C2DA` sur `#102F50` | 7,39:1 (la maquette : `#89ACCB`, 5,72:1 — acceptable) |
| Texte héros `#DCE9F5` sur `#12395E` → `#0B509A` | 9,60:1 → 6,47:1 |
| Eyebrow héros `#F4A4AF` sur `#12395E` | 6,08:1 |
| Blanc sur bouton `#D9132C` / survol `#A60E22` | 5,15:1 / 7,76:1 |

### 2.4 Focus visible

`outline: 3px solid #F4B841; outline-offset: 2px; box-shadow: 0 0 0 2px #102F50;`
L'ambre seul est à 1,78:1 sur blanc : le **liseré bleu nuit** (13,6:1 sur blanc) garantit le 3:1 de WCAG 2.4.11/2.4.13 sur fond clair, l'ambre (7,63:1 sur `#102F50`) sur fond sombre. Ne jamais supprimer le focus ; utiliser `:focus-visible`.

### 2.5 Mode sombre (optionnel)

Implémenté dans le guide (`[data-theme="dark"]` + `prefers-color-scheme`). Jetons redéfinis : fond `#0F1B2A`, surface `#162536`, texte `#E6EDF5` (13,2:1 sur surface), secondaire `#9FB2C6` (7,1:1), bleu `#6FA8E6` (6,2:1), accent texte `#FF8A99` (6,9:1), ambre `#F0B45A` sur `#3A2A12` (7,5:1), succès `#5BC99A` sur `#12342A` (6,6:1), danger `#FF8A99` sur `#3A1820` (7,0:1). **Le bouton primaire reste `#D9132C` + blanc.** Le logo reste sur un cartouche blanc (jamais inversé).

---

## 3. Typographie

| Rôle | Police | Taille / graisse | Interligne | Notes |
|---|---|---|---|---|
| Titre de page (h1) | Manrope | 28–36 px (`clamp(26px, 2.4vw + 12px, 34px)`) / 800 | 1,2 | `letter-spacing: -0.8px` |
| Titre de section (h2) | Manrope | 22 px / 800 (cartes : 17–18 px) | 1,2 | |
| Sous-titre (h3) | Manrope | 17 px / 700 | 1,25 | |
| Corps | DM Sans | 15–16 px / 400 | 1,6 | Longueur de ligne ≤ 72 caractères |
| Tableaux | DM Sans | **14 px min.** | 1,45 | En-têtes 12 px capitales, `letter-spacing: .7px` |
| Petites infos, légendes | DM Sans | **13 px min.** | 1,45 | Jamais en dessous (la maquette descend à 10–11 px : à corriger) |
| Eyebrow | Manrope ou DM Sans | 11–12 px / 800, capitales, `letter-spacing: 1.8px` | — | Rouge sur clair, `#F4A4AF` sur héros |
| Chiffres KPI | Manrope | 32 px / 800, `letter-spacing: -1px` | 1 | Chiffres tabulaires conseillés (`font-variant-numeric: tabular-nums`) |
| Code / références techniques | Monospace système | 13–14 px | 1,7 | |

Repli : `'Manrope', Arial, Helvetica, sans-serif` et `'DM Sans', Arial, Helvetica, sans-serif`. En production, **auto-héberger** les polices (pas de dépendance à Google Fonts dans une application bancaire).

---

## 4. Espacements, rayons, ombres

- **Grille de 8 px** : `4 · 8 · 12 · 16 · 24 · 32 · 48` (`--s1`…`--s7`). 12 px est toléré pour l'espacement interne des contrôles.
- **Rayons** : cartes **15 px** (héros 16–18 px), contrôles **9–10 px** (champs 8 px), badges 7 px, pastilles/chips 999 px.
- **Ombres** : carte `0 12px 35px rgba(19,47,75,.055)` ; modale/menu `0 24px 60px rgba(7,29,56,.18)`. Pas d'ombre sur les éléments internes d'une carte.
- **Gouttières** : 34 px desktop, 22 px tablette, **16 px mobile** ; espacement entre cartes 14–16 px.

---

## 5. Grille et points de rupture

| Plage | Barre latérale | Contenu | Comportements |
|---|---|---|---|
| ≥ 1 280 px | 252 px, libellés | max. 1 320–1 560 px, centré | KPI 4 colonnes ; grilles 1,45fr / 1fr |
| 1 080–1 279 px | 252 px | | Panneaux latéraux passent sous le contenu |
| 700–1 079 px | **Repliée à 74 px** (icônes + `aria-label` + infobulle) | | KPI 2 colonnes, grilles 1 colonne |
| < 700 px | **Menu tiroir** (bouton ☰, voile, `Échap`, focus piégé) | gouttière 16 px | Tout en 1 colonne ; **tableaux → cartes** ; filtres empilés ; actions principales pleine largeur |

Aucun défilement horizontal de page à 320 px de large ni à 200 % de zoom. Un tableau large défile **dans son conteneur** (`overflow-x: auto; position: relative`) — attention : sans `position: relative`, les textes `sr-only` en `position: absolute` débordent de la page (bug constaté et corrigé dans le guide).

Bandeau : hauteur 74 px (62 px mobile), fond blanc, filet `#DDE4EC`, logo large 181 px (118 px mobile).

---

## 6. Composants

### 6.1 Boutons

| Variante | Style | Usage |
|---|---|---|
| **Primaire** | Fond `#D9132C`, texte blanc 800, rayon 9 px, hauteur ≥ 42 px ; survol `#A60E22` | Une seule par zone : « + Nouvelle réclamation », « Envoyer la réponse », « Soumettre » |
| **Secondaire** | Fond blanc, texte `#12395E`, bordure `#DDE4EC` ; survol `#F6F9FC` + bordure `--field-line` | Actions alternatives : « Exporter », « Effacer les filtres » |
| **Texte** | Sans fond, texte rouge 800 ; survol fond `#FCEAED` texte `#A60E22` | Liens d'action dans une carte : « Voir les alertes → » |
| **Destructif / irréversible** | Primaire + modale de confirmation | Validation N2, envoi au client |
| Désactivé | Opacité 45 %, `cursor: not-allowed`, `aria-disabled` + **raison affichée** à côté | « Solution non approuvée : envoi impossible » |

Libellés = verbe à l'infinitif + objet (« Proposer une solution »). Icône à gauche facultative, jamais seule sans `aria-label`.

### 6.2 Carte et carte KPI

- Carte : fond blanc, bordure `#DDE4EC`, rayon 15 px, padding 20 px, ombre carte.
- **Carte KPI** : libellé 12–13 px `--muted` + bouton « i » (définition, `aria-describedby`) ; nombre Manrope 32 px ; ligne de contexte 13 px (« Du 01/09 au 30/09/2026 » ou « Au 30/09/2026 ») ; pastille d'angle teintée selon le thème (rouge pâle = vigilance, ambre = risque) **accompagnée d'une icône**. Taux : toujours « 71 / 128 · 55,5 % ». Valeur indisponible : « — » + explication (montant : « Inconnu »).

### 6.3 Badge d'état (texte + icône + couleur)

| Signal | Classe | Icône | Couleurs |
|---|---|---|---|
| Dans les délais | `ok` | ✓ coche | succès |
| À risque | `warn` | horloge | ambre (`--warn-text`) |
| En retard | `late` | triangle | danger |
| Clos en retard | `neutral` | drapeau | gris + libellé |
| Règle à valider | `info` | i | information |
| Statuts de traitement | `info` (bleu) ; « Attente d'information », « À valider » en `warn` ; « Réponse envoyée », « Clôturé » en `ok` ; « Réouvert » en `late` avec icône cycle | | |
| Décision de fond | Badge **distinct**, placé à part du statut (« Décision : Non fondée ») | | |

Taille 12 px / 800, padding 3 × 8 px, rayon 7 px, bordure 1 px teintée, icône 13 px.

### 6.4 Tableau et carte mobile

- En-têtes 12 px capitales `--muted` sur `#F8FAFC` ; cellules 14 px, padding 12 px ; lignes séparées `#E9EDF2` ; survol ligne `#EDF4FB` à 55 %.
- Référence en lien bleu 800 ; tri via `<button>` dans `<th>` avec `aria-sort`.
- **< 700 px** : chaque ligne devient une carte (`display:block`, `td::before { content: attr(data-label) }`), référence + badge d'échéance en tête.
- État vide dans le tableau : `<td colspan>` avec message + action (voir §8).

### 6.5 Filtres

Carte blanche (rayon 13 px, padding 16 px) en tête de liste ; libellés visibles au-dessus des champs (12–13 px, 700, `--muted`) ; champs 42 px de haut, bordure `--field-line`. **Agence de réception** et **entité de traitement** sont deux filtres séparés. Afficher le nombre de résultats (`aria-live="polite"`) et un bouton « Effacer les filtres ». Les filtres sont reflétés dans l'URL (partage, retour arrière) et repris dans l'en-tête des exports.

### 6.6 Chronologie

Trait vertical `#D3E2F1` 2 px, pastilles 12 px bleues ; **événement interne = pastille ambre + icône cadenas + mention « interne »**. Chaque entrée : titre 700, date + acteur 13 px `--muted`, motif. Ordre antichronologique dans le dossier, chronologique dans le suivi client. Aucun bouton de modification (événements immuables).

### 6.7 Stepper (dépôt client, parcours)

Étapes numérotées avec titre court ; étape courante : bordure rouge + `aria-current="step"` ; étape faite : fond succès + coche + texte « (terminée) » masqué ; barre de progression `role="progressbar"` avec `aria-valuetext`. Boutons « Précédent » (secondaire) / « Suivant » (primaire) en bas ; sur mobile, pleine largeur. Déplacer le focus sur le titre de l'étape à chaque changement.

### 6.8 Modale

`role="dialog"`, `aria-modal="true"`, titre relié par `aria-labelledby` ; largeur ≤ 560 px, rayon 18 px, voile `rgba(15,36,56,.76)`. Focus sur le premier champ, piégé, `Échap` ferme, retour du focus sur le déclencheur. Toute modale de transition contient le champ **Motif (obligatoire)**, le résumé de l'effet (« Le client verra : Information demandée ») et les boutons « Annuler » (secondaire) / action (primaire).

### 6.9 Toast

Bas droite (bas centre sur mobile), fond `#12395E`, texte blanc, rayon 11 px, icône d'état, 4 s minimum (plus si texte long), zone `aria-live="polite"` (erreurs : `role="alert"`). Jamais d'information indispensable uniquement dans un toast.

### 6.10 États vide, erreur, chargement

| État | Rendu |
|---|---|
| **Vide** | Icône discrète 36 px, phrase qui explique pourquoi + action utile (« Effacer les filtres », « Enregistrer un dossier ») |
| **Erreur** | Encadré danger avec icône, cause en langage clair, action (« Réessayer ») ; erreurs de champ sous le champ, `aria-invalid` + `aria-describedby`, récapitulatif en tête de formulaire si plusieurs |
| **Chargement** | Squelettes gris (`#EEF2F6`) à la forme du contenu pour listes/KPI ; bouton en cours : libellé « Envoi… » + `aria-busy`, désactivé ; pas de spinner plein écran |
| **Règle non validée** | Bandeau ambre « Règle de démonstration — non validée par la conformité BSCA » partout où une échéance est affichée |

### 6.11 Graphiques

Barres reçues `#6B9DCC` / réponses `#D9132C` (légende texte + motif), axes `#DDE4EC`, étiquettes 13 px. **Chaque graphique a un résumé textuel** (paragraphe visible ou `<figcaption>`) et un tableau de données accessible.

---

## 7. Logo

| Règle | Détail |
|---|---|
| Fichiers | `assets/logos/bsca-wide.png` (445 × 114, logo + signature « Banque Sino-Congolaise pour l'Afrique ») ; `assets/logos/bsca-mark.png` (200 × 200, monogramme B rond). Fonds blancs intégrés (PNG sans transparence). |
| Versions | **Logo avec signature** : connexion, bandeau, accueil, documents sortants (exports PDF, courriers). **Monogramme** : barre latérale, écrans compacts, favicon, avatar d'application. |
| Zone de protection | Au moins la **hauteur du « B » du monogramme** (≈ 40 % de la hauteur du logo large) sur chaque côté ; dans le bandeau 74 px, le logo de 181 × 46 px laisse 14 px au-dessus/en dessous — minimum acceptable. Aucun texte ni filet dans cette zone. |
| Tailles minimales | Logo large : **150 px** de large à l'écran (signature encore lisible), 118 px toléré sur mobile < 380 px seulement si le monogramme n'est pas utilisé à côté ; 40 mm à l'impression. Monogramme : **24 px** (favicon 32 px recommandé), 32 px dans la barre latérale mobile, 40 px desktop. |
| Proportions | Toujours `height: auto` (ou `object-fit: contain`) ; ne jamais étirer, rogner, pivoter, ombrer. |
| Couleurs | Ne jamais recolorier ni inverser. Sur fond sombre (barre latérale, mode sombre, héros) : poser le logo sur un **cartouche blanc** (cercle blanc pour le monogramme, rectangle arrondi 8 px pour le logo large). Une version blanche officielle devra être fournie par BSCA pour les fonds rouge/bleu. |
| Texte alternatif | Logo large : « BSCA Bank — Banque Sino-Congolaise pour l'Afrique » ; monogramme décoratif à côté du nom : `alt=""`. |

---

## 8. Microcopie

**Ton** : vouvoiement, phrases courtes, voix active, vocabulaire métier stable. On dit ce qui s'est passé, pourquoi et quoi faire. Pas de jargon technique côté client (« statut interne », « workflow », codes). Côté client, on ne nomme jamais un agent.

**Vocabulaire fixe** : réclamation (pas « ticket »), dossier, référence, code de suivi, accusé de réception, échéance, réponse finale, décision (fondée / partiellement fondée / non fondée / irrecevable motivée), agence de réception, entité de traitement, note interne, message au client, réouverture.

| Situation | Formulation recommandée |
|---|---|
| Erreur de champ | « Indiquez une adresse e-mail valide, par exemple nom@exemple.cg. » |
| Fichier refusé | « Ce fichier dépasse 10 Mo. Réduisez-le ou envoyez-le en plusieurs parties (PDF, JPG ou PNG). » |
| Motif manquant | « Précisez le motif du changement : il sera enregistré dans l'historique du dossier. » |
| Droit insuffisant (403) | « Vous n'avez pas accès à ce dossier. Il dépend d'une autre entité : contactez son responsable. » |
| Session expirée | « Votre session a expiré après 30 minutes d'inactivité. Reconnectez-vous pour continuer ; votre saisie a été conservée. » |
| Réseau / serveur | « Le service ne répond pas pour le moment. Vos modifications ne sont pas perdues : réessayez dans quelques instants. » |
| Mot de passe oublié | « Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé. » (message neutre, toujours identique) |
| Vide — liste filtrée | « Aucun dossier ne correspond à ces filtres. » + bouton « Effacer les filtres » |
| Vide — file personnelle | « Aucun dossier ne vous est affecté. Les nouveaux dossiers apparaîtront ici dès leur affectation. » |
| Vide — client | « Vous n'avez pas encore de réclamation. » + « Déposer une réclamation » |
| Confirmation — dépôt | « Votre réclamation est enregistrée. Référence : TG-BSCA-2026-000241. Notez votre code de suivi : il ne sera plus affiché. » |
| Confirmation — transition | « Dossier passé en « Attente d'information ». Le client voit : « Information demandée ». L'échéance du 27/10/2026 est maintenue. » |
| Confirmation avant envoi | Titre « Envoyer la réponse au client ? » ; corps « La réponse sera envoyée par e-mail et ne pourra pas être modifiée. La décision « Partiellement fondée » sera enregistrée. » ; boutons « Annuler » / « Envoyer la réponse » |
| Doublon | « Ce dossier sera marqué comme doublon de TG-BSCA-2026-000013. Aucun dossier n'est supprimé. » |
| Règle non validée | « Règle de démonstration — non validée par la conformité BSCA. » |
| Montant inconnu | Affichage « Inconnu » partout (listes, dossier, solution, dépôt) — jamais « 0 XAF » ; les autres valeurs absentes s'affichent « — » |

Formats : dates `28/09/2026` (listes) et `lundi 28 septembre 2026` (échéances, courriers) ; heure `14:05` ; montants `150 000 XAF` (espace fine insécable, devise après) ; pourcentages `55,5 %`.

---

## 9. Accessibilité — liste de contrôle de recette

- [ ] Navigation clavier complète, ordre logique, lien d'évitement « Aller au contenu ».
- [ ] Focus visible §2.4 sur tous les éléments interactifs, y compris dans les SVG.
- [ ] Contrastes conformes aux tableaux §2 (texte ≥ 4,5:1, composants et focus ≥ 3:1).
- [ ] États toujours avec texte + icône ; graphiques avec résumé textuel.
- [ ] Formulaires : `<label>` visibles, `aria-invalid`, erreurs reliées, pas de placeholder comme seul libellé.
- [ ] Changement de page SPA : titre de document mis à jour, focus déplacé sur le `h1`, fil d'Ariane.
- [ ] Zones dynamiques (`aria-live`) pour toasts, compteurs de résultats, calculs.
- [ ] Lisible et utilisable à 200 % et à 320 px de large, sans défilement horizontal.
- [ ] `prefers-reduced-motion` respecté (animations ≤ 350 ms sinon).
- [ ] Cibles tactiles ≥ 24 px (44 px recommandés sur mobile).
