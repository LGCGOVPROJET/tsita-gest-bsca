/* ==========================================================================
   TSITA GEST × BSCA Bank — Guide interactif (vanilla JS, hors ligne)
   Sections : moteur de délais · données du guide · routeur · rendus · recherche
   Toutes les données sont fictives. Seuils de délai = démonstration.
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   1. Moteur de délais (miroir du service DeadlineCalculator, ARCHITECTURE §7)
   Les dates sont manipulées comme des « dates locales » Africa/Brazzaville
   (UTC+1, sans heure d'été) représentées en minuit UTC, ce qui évite tout
   décalage lié au fuseau du poste qui consulte le guide.
   -------------------------------------------------------------------------- */
var TGDeadline = (function () {
  var DAY = 86400000;
  var RULES = {
    ack: { code: 'AR-DEMO', label: 'Accusé de réception', unit: 'business', duration: 10, version: 1, source: 'demonstration', status: 'a_valider' },
    final: { code: 'RF-DEMO', label: 'Réponse finale', unit: 'calendar', duration: 45, version: 1, source: 'demonstration', status: 'a_valider' },
    pre: { code: 'PA-DEMO', label: 'Pré-alerte interne', unit: 'business', duration: 5, version: 1, source: 'demonstration', status: 'a_valider' }
  };
  var YEARS = [2025, 2026, 2027];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function fromKey(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || '');
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return key(d) === k ? d : null;
  }
  function addDays(d, n) { return new Date(d.getTime() + n * DAY); }

  /* Pâques grégorienne (algorithme de Meeus/Jones/Butcher) */
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31),
      day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(y, month - 1, day));
  }
  function holidaysOf(y) {
    var e = easter(y);
    return [
      [new Date(Date.UTC(y, 0, 1)), "Jour de l'An"],
      [addDays(e, 1), 'Lundi de Pâques'],
      [new Date(Date.UTC(y, 4, 1)), 'Fête du Travail'],
      [addDays(e, 39), 'Ascension'],
      [addDays(e, 50), 'Lundi de Pentecôte'],
      [new Date(Date.UTC(y, 5, 10)), 'Fête de la Réconciliation nationale'],
      [new Date(Date.UTC(y, 7, 15)), "Fête de l'Indépendance"],
      [new Date(Date.UTC(y, 10, 1)), 'Toussaint'],
      [new Date(Date.UTC(y, 10, 28)), 'Proclamation de la République'],
      [new Date(Date.UTC(y, 11, 25)), 'Noël']
    ].sort(function (a, b) { return a[0] - b[0]; });
  }
  var HOLIDAYS = {};
  YEARS.forEach(function (y) { holidaysOf(y).forEach(function (h) { HOLIDAYS[key(h[0])] = h[1]; }); });

  function isWeekend(d) { var w = d.getUTCDay(); return w === 0 || w === 6; }
  function holiday(d) { return HOLIDAYS[key(d)] || null; }
  function isBusiness(d) { return !isWeekend(d) && !holiday(d); }
  function reason(d) { return holiday(d) ? 'Férié : ' + holiday(d) : (isWeekend(d) ? (d.getUTCDay() === 6 ? 'Samedi' : 'Dimanche') : null); }

  /* Calcule les échéances pour une date de réception AAAA-MM-JJ. */
  function compute(receivedKey) {
    var r = fromKey(receivedKey);
    if (!r) return { error: 'Date invalide.' };
    var min = Date.UTC(2025, 0, 1), max = Date.UTC(2027, 9, 31);
    if (r.getTime() < min || r.getTime() > max) {
      return { error: 'Le calendrier de démonstration couvre 2025 à 2027 : choisissez une réception entre le 1er janvier 2025 et le 31 octobre 2027.' };
    }
    /* Réception un samedi, dimanche ou férié : départ au prochain jour ouvré
       (la réclamation est réputée reçue ce jour-là), puis J+1 = premier jour compté. */
    var start = r;
    while (!isBusiness(start)) start = addDays(start, 1);

    var days = [{ date: r, type: 'reception', note: reason(r) }];
    var cursor = r;
    while (cursor < start) {
      cursor = addDays(cursor, 1);
      if (cursor.getTime() === start.getTime()) days.push({ date: cursor, type: 'start', note: 'Réputée reçue (départ)' });
      else days.push({ date: cursor, type: 'skip', note: reason(cursor) });
    }
    var n = 0; cursor = start;
    while (n < RULES.ack.duration) {
      cursor = addDays(cursor, 1);
      if (isBusiness(cursor)) { n++; days.push({ date: cursor, type: 'count', n: n }); }
      else days.push({ date: cursor, type: holiday(cursor) ? 'holiday' : 'skip', note: reason(cursor) });
    }
    var ack = cursor;
    var fin = addDays(r, RULES.final.duration);
    var pre = fin, m = 0;
    while (m < RULES.pre.duration) { pre = addDays(pre, -1); if (isBusiness(pre)) m++; }
    var skipped = days.filter(function (d) { return d.type === 'skip' || d.type === 'holiday'; });
    var holidaysCrossed = days.filter(function (d) { return d.type === 'holiday' || (d.note && /^Férié/.test(d.note)); });
    return {
      received: r, start: start, shifted: start.getTime() !== r.getTime(),
      ack: ack, final: fin, pre: pre, days: days, skipped: skipped.length,
      holidays: holidaysCrossed.map(function (d) { return { date: d.date, label: holiday(d.date), weekend: isWeekend(d.date) }; }),
      finalNote: reason(fin)
    };
  }
  function iso(d) { return key(d) + 'T23:59:59+01:00'; }
  function list() { return YEARS.map(function (y) { return { year: y, items: holidaysOf(y) }; }); }

  return { compute: compute, key: key, fromKey: fromKey, iso: iso, list: list, isWeekend: isWeekend, holiday: holiday, easter: easter, RULES: RULES };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = TGDeadline; }

/* ==========================================================================
   Tout ce qui suit ne s'exécute que dans un navigateur.
   ========================================================================== */
if (typeof document !== 'undefined') (function () {

  /* ------------------------------------------------------------------------
     2. Utilitaires
     ------------------------------------------------------------------------ */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible : on ignore */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } }
  };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function strip(html) { var d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ICONS = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
    screen: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    cycle: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    desk: '<path d="M3 10h18M5 10v10M19 10v10"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
    scale: '<path d="M12 3v18M5 21h14M6 7h12"/><path d="m6 7-3 7a3 3 0 0 0 6 0L6 7ZM18 7l-3 7a3 3 0 0 0 6 0l-3-7Z"/>',
    building: '<path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-4h6v4M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    minus: '<path d="M6 12h12"/>',
    half: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/>',
    warn: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'
  };
  function icon(name, cls) { return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>'; }

  function toast(msg) {
    var z = $('#toasts'); var t = document.createElement('div');
    t.className = 'toast'; t.innerHTML = icon('check', 'sm') + '<span>' + esc(msg) + '</span>';
    z.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  function copyText(text, label) {
    function ok() { toast((label || 'Texte') + ' copié dans le presse-papiers.'); }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { toast('Copie impossible : sélectionnez le texte manuellement.'); }
      ta.remove();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }
  var fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  var fmtShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  var fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  var fmtNum = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function todayBrazzaville() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Brazzaville', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { var d = new Date(Date.now() + 3600000); return TGDeadline.key(d); }
  }

  /* ------------------------------------------------------------------------
     3. Données du guide
     ------------------------------------------------------------------------ */
  var ROLES = [
    { id: 'client', label: 'Client', long: 'Client ou mandataire', icon: 'user', ini: 'CL', desc: 'Déposer une réclamation, suivre son avancement, échanger avec la banque et demander une réouverture.', scope: 'Ses propres dossiers uniquement, via le portail. Ne voit jamais les notes internes, noms d\'agents, avis de contrôle ni pièces internes.' },
    { id: 'agent_accueil', label: "Agent d'accueil", long: "Agent d'accueil, agence ou centre de contact", icon: 'desk', ini: 'AA', desc: 'Enregistrer une réclamation reçue en agence, par téléphone, courriel ou courrier, et accuser réception.', scope: "Dossiers de son agence (agence de réception) et ceux qu'il a créés." },
    { id: 'gestionnaire', label: 'Gestionnaire', long: 'Gestionnaire', icon: 'folder', ini: 'GE', desc: 'Instruire les faits, échanger avec le client, proposer une solution et préparer la réponse.', scope: 'Dossiers dont il est propriétaire ou suppléant, et dossiers de son entité de traitement.' },
    { id: 'responsable', label: 'Responsable', long: 'Responsable de traitement', icon: 'users', ini: 'RT', desc: 'Affecter, réattribuer, escalader et approuver les solutions (niveau 1) dans son entité.', scope: 'Tous les dossiers de son entité de traitement.' },
    { id: 'qualite', label: 'Qualité', long: 'Qualité et service client', icon: 'star', ini: 'QS', desc: 'Contrôler les réponses, repérer les causes récurrentes et piloter les actions correctives.', scope: 'Tous les dossiers en lecture ; contrôles qualité et plans d\'action.' },
    { id: 'conformite', label: 'Conformité', long: 'Conformité et contrôle interne', icon: 'scale', ini: 'CO', desc: 'Valider les règles de délai, approuver les solutions de niveau 2, valider les rapports et consulter l\'audit.', scope: 'Tous les dossiers en lecture, journaux d\'audit, validation des règles et des rapports.' },
    { id: 'direction', label: 'Direction', long: 'Direction', icon: 'building', ini: 'DG', desc: 'Suivre les tendances, stocks, délais et actions à partir d\'agrégats.', scope: 'Agrégats seulement : tableau de bord et rapports, noms masqués (« J. M*** »), aucun accès aux pièces.' },
    { id: 'admin', label: 'Administrateur', long: 'Administrateur fonctionnel et technique', icon: 'gear', ini: 'AD', desc: 'Gérer comptes, référentiels, calendriers, règles, modèles, imports et journaux.', scope: 'Paramétrage et supervision ; aucun traitement de dossier (séparation des responsabilités).' }
  ];
  var ROLE = {}; ROLES.forEach(function (r) { ROLE[r.id] = r; });

  /* Parcours pas à pas. `who` = profils concernés ; `screen` = lien vers un écran commenté. */
  var J = [
    {
      id: 'deposer', title: 'Déposer une réclamation', who: ['client'], mins: 4,
      summary: 'Remplir le formulaire du portail, joindre des justificatifs et conserver sa référence et son code de suivi.',
      steps: [
        { t: 'Ouvrir le portail client', b: '<p>Depuis la page de connexion BSCA, choisissez <b>« Espace client »</b> puis <b>« Déposer une réclamation »</b>. Aucun compte n\'est nécessaire : un client connecté retrouve simplement ses dossiers dans son espace.</p><ul><li>Le formulaire fonctionne sur téléphone, tablette et ordinateur.</li><li>Une barre d\'étapes indique où vous en êtes : Identité, Objet, Faits, Pièces, Vérification, Confirmation.</li></ul>', screen: 'depot/1' },
        { t: 'Indiquer votre identité et vos coordonnées', b: '<p>Renseignez votre nom, votre adresse e-mail et, si vous le souhaitez, votre téléphone et votre numéro client. Choisissez le <b>canal de réponse préféré</b> : e-mail, courrier ou téléphone.</p><div class="info">' + '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>' + '<div>Le numéro client est chiffré en base. La référence de votre dossier ne révèle jamais votre identité ni votre numéro de compte.</div></div>', screen: 'depot/2' },
        { t: 'Décrire l\'objet et les faits', b: '<p>Sélectionnez le <b>produit</b> concerné (carte, compte, virement, banque digitale…) et, si possible, la nature de la demande et l\'agence. Décrivez ensuite ce qui s\'est passé :</p><ul><li>la date de l\'opération ;</li><li>le montant <b>et sa devise</b> (XAF par défaut) — laissez vide si vous ne le connaissez pas ;</li><li>ce que vous attendez de la banque.</li></ul>' },
        { t: 'Joindre vos justificatifs', b: '<p>Ajoutez jusqu\'à <b>5 fichiers</b> (PDF, JPG ou PNG, <b>10 Mo maximum</b> chacun) : relevé, ticket, capture d\'écran, courrier. Chaque fichier est analysé avant d\'être accessible aux équipes.</p><p>Vous pourrez ajouter d\'autres pièces plus tard depuis le suivi de votre demande.</p>', screen: 'depot/3' },
        { t: 'Vérifier et donner votre consentement', b: '<p>Relisez le récapitulatif. Cochez la case de <b>consentement</b> au traitement de vos données pour l\'instruction de la réclamation : sans elle, le dépôt n\'est pas possible.</p>', screen: 'depot/4' },
        { t: 'Conserver votre référence et votre code de suivi', b: '<p>La confirmation affiche :</p><ul><li>la <b>référence</b> du dossier, au format <code>TG-BSCA-2026-000123</code> ;</li><li>le <b>code de suivi</b> de 8 caractères, <b>affiché une seule fois</b> ;</li><li>les dates prévisionnelles d\'accusé de réception et de réponse.</li></ul><div class="warnbox"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18h.01"/></svg><div>Notez ou imprimez le code de suivi : la banque n\'en conserve qu\'une empreinte et ne peut pas vous le renvoyer.</div></div>', screen: 'depot/5' }
      ]
    },
    {
      id: 'suivre', title: 'Suivre sa demande', who: ['client'], mins: 3,
      summary: 'Consulter l\'état, les messages et la réponse avec la référence et le code de suivi.',
      steps: [
        { t: 'S\'identifier avec la référence et le code', b: '<p>Dans <b>« Suivre ma demande »</b>, saisissez la référence (<code>TG-BSCA-…</code>) et le code de suivi reçu au dépôt. Après plusieurs essais infructueux, l\'accès est temporairement limité pour protéger votre dossier.</p>' },
        { t: 'Comprendre l\'état affiché', b: '<p>Vous voyez un <b>état simplifié</b> :</p><ul><li><b>Reçue</b> — votre demande est enregistrée ;</li><li><b>En cours d\'analyse</b> — une équipe l\'examine ;</li><li><b>Information demandée</b> — la banque attend un élément de votre part ;</li><li><b>Réponse envoyée</b>, <b>Clôturée</b> ou <b>Réouverte</b>.</li></ul><p>La date de dernière mise à jour et la <b>prochaine étape</b> sont toujours indiquées.</p>' },
        { t: 'Répondre à une demande d\'information', b: '<p>Si l\'état est « Information demandée », lisez le message de la banque puis répondez depuis la zone <b>Messages</b> ou ajoutez la pièce demandée. Le délai de réponse de la banque <b>continue de courir</b> pendant l\'attente.</p>' },
        { t: 'Lire la réponse définitive', b: '<p>Quand la réponse est envoyée, elle s\'affiche en tête du suivi avec sa date. Elle explique la décision (fondée, partiellement fondée, non fondée ou irrecevable motivée) et la solution retenue.</p><p>Si vous n\'êtes pas d\'accord, un bouton <b>« Contester / demander une réouverture »</b> apparaît : voir le parcours dédié.</p>' }
      ]
    },
    {
      id: 'saisir', title: 'Saisir une réclamation reçue en agence, par téléphone ou courrier', who: ['agent_accueil', 'gestionnaire', 'responsable'], mins: 5,
      summary: 'Enregistrer un dossier pour le compte du client avec son canal d\'origine et sa date effective de réception.',
      steps: [
        { t: 'Ouvrir « Enregistrer un dossier »', b: '<p>Depuis la liste des réclamations ou le tableau de bord, cliquez sur le bouton rouge <b>« + Enregistrer un dossier »</b>.</p>', screen: 'liste/7' },
        { t: 'Choisir le canal et la date effective', b: '<p>Indiquez le <b>canal d\'origine</b> (agence, téléphone, courriel, courrier) et la <b>date effective de réception</b> — par exemple la date du cachet d\'un courrier, pas celle de la saisie. C\'est cette date qui fait courir les délais.</p><div class="info"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg><div>L\'<b>agence de réception</b> est pré-remplie avec la vôtre. Elle reste distincte de l\'<b>entité de traitement</b> qui résoudra le problème.</div></div>' },
        { t: 'Rattacher ou créer le client', b: '<p>Recherchez le client existant (nom, e-mail, téléphone) pour <b>rattacher</b> le dossier à sa fiche. À défaut, saisissez ses coordonnées. <b>Vérifiez-les avec lui</b> : elles servent à l\'accusé de réception et à la réponse.</p>' },
        { t: 'Décrire la demande et joindre les éléments', b: '<p>Saisissez l\'objet, les faits, le produit, le montant et sa devise si pertinents. Numérisez et joignez les documents remis. Choisissez pour chaque pièce sa <b>classification</b> (client, interne, confidentiel) et sa <b>visibilité</b>.</p>' },
        { t: 'Accuser réception', b: '<p>Après l\'enregistrement, utilisez <b>« Accuser réception »</b> : choisissez le modèle, le canal et indiquez le résultat d\'envoi. La preuve est conservée ; un <b>échec de distribution</b> reste visible sur le dossier et doit être traité (autre canal, coordonnées à corriger).</p>' },
        { t: 'Remettre la référence au client', b: '<p>Communiquez au client la <b>référence</b> et le <b>code de suivi</b> (affiché une seule fois). Le dossier passe au statut <b>Reçu</b> puis <b>À qualifier</b>.</p>' }
      ]
    },
    {
      id: 'qualifier', title: 'Qualifier et affecter', who: ['agent_accueil', 'gestionnaire', 'responsable'], mins: 4,
      summary: 'Compléter la typologie, repérer un doublon, fixer la priorité et désigner un propriétaire unique.',
      steps: [
        { t: 'Ouvrir la file « À qualifier »', b: '<p>Dans la liste, filtrez sur le statut <b>À qualifier</b>. Triez par date de réception pour traiter les plus anciens d\'abord.</p>', screen: 'liste/2' },
        { t: 'Compléter la qualification', b: '<p>Renseignez la <b>nature</b>, le <b>produit</b>, l\'<b>entité de traitement</b>, la <b>priorité</b> (basse à critique), le <b>niveau de risque</b>, le montant et la devise. Un montant absent reste <b>inconnu</b>, jamais zéro.</p><p>Chaque modification exige un <b>motif</b> ; l\'audit conserve les valeurs avant et après.</p>' },
        { t: 'Vérifier les doublons', b: '<p>Le dossier signale les réclamations proches (même client, même produit, dates voisines). Si c\'est un doublon, utilisez <b>« Marquer comme doublon »</b> en désignant le dossier principal : <b>rien n\'est supprimé</b>, les deux restent liés et consultables.</p>' },
        { t: 'Affecter un propriétaire (responsable)', b: '<p>Le responsable désigne un <b>propriétaire unique</b> et, si besoin, un <b>suppléant</b>. Il peut créer des <b>tâches</b> avec échéance. Le dossier passe en <b>Affecté</b> ; le gestionnaire est notifié.</p>' },
        { t: 'Réattribuer ou escalader', b: '<p>En cas d\'absence, de mauvaise orientation ou de risque de retard, le responsable <b>réattribue</b> (avec motif) ou <b>escalade</b>. L\'historique d\'affectation reste visible dans la chronologie.</p>' }
      ]
    },
    {
      id: 'instruire', title: 'Instruire un dossier', who: ['gestionnaire', 'responsable'], mins: 6,
      summary: 'Rassembler les faits, dialoguer avec le client et documenter la cause, sans jamais mélanger échanges client et notes internes.',
      steps: [
        { t: 'Démarrer l\'investigation', b: '<p>Ouvrez le dossier depuis <b>« Mes dossiers »</b>. Lisez le bandeau : référence, statut, propriétaire, échéance. Passez le statut en <b>En investigation</b> avec un motif court (« Analyse de l\'opération carte »).</p>', screen: 'dossier/1' },
        { t: 'Suivre la prochaine action', b: '<p>La carte <b>« Prochaine action »</b> est calculée par l\'application (ex. « Accuser réception », « Proposer une solution », « Relancer le client »). Elle vous évite d\'oublier une étape.</p>', screen: 'dossier/2' },
        { t: 'Gérer les pièces', b: '<p>Onglet <b>Pièces</b> : ajoutez les preuves internes (extraits, journaux d\'opération) avec la bonne <b>classification</b>. Une pièce <b>interne</b> ou <b>confidentielle</b> n\'est jamais visible par le client. Chaque téléchargement est journalisé.</p>' },
        { t: 'Échanger avec le client… ou noter en interne', b: '<p>Onglet <b>Échanges</b>, choisissez explicitement le type :</p><ul><li><b>Message au client</b> — visible sur son suivi, envoyé par le canal choisi, avec statut d\'envoi ;</li><li><b>Note interne</b> — réservée aux équipes, signalée par un fond ambre et l\'icône cadenas.</li></ul><div class="warnbox"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18h.01"/></svg><div>Relisez le type avant d\'envoyer : un message client ne peut pas être « rappelé ».</div></div>', screen: 'dossier/8' },
        { t: 'Demander une information complémentaire', b: '<p>Envoyez un message client précis puis passez le statut en <b>Attente d\'information</b>. Le client voit « Information demandée ». <b>L\'échéance n\'est pas suspendue</b> : si vous annoncez une nouvelle date au client, elle est enregistrée à part et l\'échéance initiale reste inchangée.</p>' },
        { t: 'Documenter la cause', b: '<p>Consignez la <b>cause provisoire</b> puis confirmée. Distinguez le motif déclaré par le client de la cause établie : c\'est ce qui alimente l\'analyse qualité des causes récurrentes.</p>' }
      ]
    },
    {
      id: 'solution', title: 'Proposer une solution et la faire valider (N1 / N2)', who: ['gestionnaire', 'responsable', 'conformite'], mins: 5,
      summary: 'Rédiger une proposition versionnée, la soumettre et obtenir les approbations requises selon le montant.',
      steps: [
        { t: 'Créer une proposition', b: '<p>Onglet <b>Solution</b> › <b>« + Proposer une solution »</b>. Choisissez le type : <b>remboursement</b>, <b>correction d\'opération</b>, <b>explication motivée</b>, <b>autre mesure</b> ou <b>non-fondement</b>. Renseignez la description, la cause racine, le montant et sa devise.</p>' },
        { t: 'Indiquer la décision de fond', b: '<p>Choisissez la décision : <b>fondée</b>, <b>partiellement fondée</b>, <b>non fondée</b> ou <b>irrecevable motivée</b>. Elle ne remplace pas le statut : elle sera copiée sur le dossier à l\'envoi de la réponse.</p>' },
        { t: 'Soumettre au circuit de validation', b: '<p>Cliquez sur <b>« Soumettre »</b>. Le dossier passe en <b>À valider</b>. Chaque nouvelle version est conservée : une proposition n\'est <b>jamais écrasée</b>.</p>' },
        { t: 'Approbation niveau 1 (responsable)', b: '<p>Le responsable de l\'entité approuve ou rejette avec commentaire depuis <b>Solutions et validations</b>. En cas de rejet, le dossier revient en <b>Solution proposée</b> pour une nouvelle version.</p>' },
        { t: 'Approbation niveau 2 (conformité)', b: '<p>Si le montant atteint le <b>seuil N2</b> (démonstration : <b>500 000 XAF</b>), la solution exige en plus l\'approbation de la <b>conformité</b>. Le badge « N2 requis » l\'indique dans la liste.</p><div class="info"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg><div>Le seuil est un paramètre administrable (<code>n2_threshold</code>) à confirmer par BSCA.</div></div>' }
      ]
    },
    {
      id: 'reponse', title: 'Envoyer la réponse et clôturer', who: ['gestionnaire', 'responsable'], mins: 4,
      summary: 'Transmettre la réponse approuvée avec preuve d\'envoi, puis clôturer le dossier.',
      steps: [
        { t: 'Vérifier que la solution est approuvée', b: '<p>Le bouton <b>« Envoyer la réponse »</b> n\'est actif que si la solution a toutes ses approbations. Sinon, l\'application indique ce qui manque.</p>' },
        { t: 'Rédiger à partir d\'un modèle', b: '<p>Choisissez le modèle <b>« Réponse »</b>. Les champs <code>{{reference}}</code>, <code>{{client}}</code>, <code>{{date_limite}}</code> sont remplis automatiquement. Adaptez le texte : décision, explication, mesure appliquée, voies de recours.</p>' },
        { t: 'Envoyer et conserver la preuve', b: '<p>Choisissez le canal et envoyez. L\'application enregistre la <b>date de réponse finale</b>, le statut <b>Réponse envoyée</b>, copie la <b>décision</b> sur le dossier et conserve la preuve d\'envoi. Un échec d\'envoi reste visible et doit être relancé.</p>' },
        { t: 'Clôturer', b: '<p>Une fois la mesure mise en œuvre (remboursement passé, correction effectuée), passez le dossier en <b>Clôturé</b> avec un motif. La clôture ne supprime rien : le dossier reste consultable et peut être <b>réouvert</b>.</p>' }
      ]
    },
    {
      id: 'reouverture', title: 'Réouverture, contestation et médiation', who: ['client', 'gestionnaire', 'responsable', 'conformite'], mins: 3,
      summary: 'Traiter une contestation sans effacer l\'historique : un dossier enfant est créé et lié au dossier d\'origine.',
      steps: [
        { t: 'Le client conteste', b: '<p>Depuis son suivi, le client clique sur <b>« Contester / demander une réouverture »</b> et explique pourquoi. Un agent peut aussi réouvrir depuis le dossier (bouton <b>Réouvrir</b>, motif obligatoire).</p>' },
        { t: 'Un dossier enfant est créé', b: '<p>La réouverture crée un <b>nouveau dossier</b> au statut <b>Réouvert</b>, lié au dossier d\'origine. L\'ancien dossier, sa réponse initiale et sa décision <b>restent intacts et consultables</b>. Pour les indicateurs, le dossier enfant compte comme une <b>nouvelle entrée</b>.</p>' },
        { t: 'Reprendre l\'instruction', b: '<p>Le dossier enfant repasse en <b>En investigation</b> et suit le cycle normal : nouvelle solution, validation, réponse. Ses échéances sont recalculées depuis sa propre date de réception.</p>' },
        { t: 'Orienter vers la médiation', b: '<p>Si le client demande une médiation, enregistrez la date de la demande sur le dossier. La procédure de médiation applicable doit être <b>validée par la conformité BSCA</b> ; le guide ne préjuge pas de ses délais.</p>' }
      ]
    },
    {
      id: 'delais', title: 'Gérer les délais et les alertes', who: ['gestionnaire', 'responsable', 'conformite', 'qualite'], mins: 4,
      summary: 'Lire les signaux d\'échéance, traiter les files « à échéance », « en retard » et « clos en retard ».',
      steps: [
        { t: 'Lire le signal d\'échéance', b: '<p>Chaque dossier porte un signal <b>texte + icône + couleur</b> :</p><ul><li><span class="badge ok">' + icon('check') + 'Dans les délais</span></li><li><span class="badge warn">' + icon('clock') + 'À risque</span> — pré-alerte atteinte</li><li><span class="badge late">' + icon('warn') + 'En retard</span> — ouvert après l\'échéance</li><li><span class="badge neutral">' + icon('flag') + 'Clos en retard</span></li><li><span class="badge info">' + icon('info') + 'Règle à valider</span></li></ul>', screen: 'liste/4' },
        { t: 'Ouvrir la page Délais et alertes', b: '<p>Trois files : <b>À échéance</b>, <b>En retard</b>, <b>Clos en retard</b>, avec un compteur par file et les règles actives. Filtrez par entité pour une vue responsable.</p>' },
        { t: 'Comprendre le calcul', b: '<p>Fuseau Africa/Brazzaville ; le jour de réception n\'est pas compté ; jours ouvrés = lundi–vendredi hors jours fériés ; échéance à 23:59:59. Essayez le <a href="#delais">simulateur de délais</a>.</p>' },
        { t: 'Échéance initiale et date annoncée', b: '<p>L\'<b>échéance initiale</b> n\'est jamais modifiée. Si vous annoncez au client une nouvelle date, elle est stockée à part (« date annoncée ») et le retard reste mesuré sur l\'échéance initiale.</p>' },
        { t: 'Escalader avec preuve', b: '<p>Pour un dossier à risque ou en retard, escaladez au responsable avec un motif : l\'escalade est tracée dans la chronologie et l\'audit, et sert de preuve lors des contrôles.</p>' }
      ]
    },
    {
      id: 'tableau', title: 'Piloter avec le tableau de bord', who: ['responsable', 'direction', 'qualite', 'conformite', 'gestionnaire'], mins: 4,
      summary: 'Lire les quatre indicateurs, appliquer des filtres cohérents et repérer les priorités.',
      steps: [
        { t: 'Régler la période et le périmètre', b: '<p>La carte de filtres en tête fixe la <b>période</b>, l\'<b>agence de réception</b>, l\'<b>entité de traitement</b>, la nature, le produit, le canal. Les mêmes filtres s\'appliquent aux listes et aux exports.</p>', screen: 'tableau/3' },
        { t: 'Lire les quatre indicateurs', b: '<p><b>Reçues</b> (par date de réception), <b>Réponses</b> (par date de réponse finale), <b>Stock</b> (ouverts à la date de calcul), <b>À risque</b>. Chaque carte affiche la période, la date de calcul et une définition accessible (bouton « i »). Voir le <a href="#indicateurs">glossaire</a>.</p>', screen: 'tableau/4' },
        { t: 'Analyser l\'évolution', b: '<p>Le graphique mensuel compare reçues et réponses. Un <b>résumé textuel</b> accompagne chaque graphique (lu par les lecteurs d\'écran).</p>', screen: 'tableau/5' },
        { t: 'Agir sur les priorités', b: '<p>La liste « Priorités du jour » regroupe les 5 dossiers les plus urgents ; « Dernières actions » montre l\'activité récente. Pour la direction, les noms de clients sont <b>masqués</b>.</p>', screen: 'tableau/7' }
      ]
    },
    {
      id: 'rapport', title: 'Produire un rapport et un export traçable', who: ['conformite', 'direction', 'responsable', 'qualite'], mins: 4,
      summary: 'Générer le rapport d\'activité réconcilié et un export qui garde période, filtres, date de calcul et version de règle.',
      steps: [
        { t: 'Choisir le rapport et ses filtres', b: '<p>Page <b>Rapports</b> › <b>Rapport d\'activité</b>. Fixez la période, la date de calcul et les filtres. Répartitions : mois, agence, entité, canal, nature, décision.</p>' },
        { t: 'Contrôler la réconciliation', b: '<p>Vérifiez l\'égalité <b>stock de début + entrées − réponses ± ajustements = stock de fin</b>. Un indicateur <span class="badge ok">' + icon('check') + 'Équilibré</span> ou <span class="badge late">' + icon('warn') + 'Écart à expliquer</span> s\'affiche.</p>' },
        { t: 'Exporter (CSV, Excel, PDF)', b: '<p>L\'en-tête du fichier reprend <b>période, filtres, date de calcul, version de règle et utilisateur</b>. Chaque export est journalisé (qui, quand, quels filtres, combien de lignes).</p>' },
        { t: 'Faire valider par la conformité', b: '<p>La conformité valide le rapport : le nom du valideur et la date figurent sur la version exportée. Un rapport validé n\'est plus modifiable ; une correction produit une nouvelle version.</p>' }
      ]
    },
    {
      id: 'qualite', title: 'Mener une action qualité', who: ['qualite', 'responsable'], mins: 4,
      summary: 'Contrôler des réponses, regrouper les causes récurrentes et suivre une action corrective jusqu\'à la preuve d\'efficacité.',
      steps: [
        { t: 'Contrôler un échantillon de réponses', b: '<p>Depuis un dossier répondu, onglet <b>Contrôle</b> : résultat <b>conforme</b>, <b>non conforme</b> ou <b>à revoir</b>, avec constats. Les avis de contrôle ne sont <b>jamais visibles par le client</b>.</p>' },
        { t: 'Repérer les causes récurrentes', b: '<p>Page <b>Qualité et actions</b> › <b>Récurrences</b> : regroupements par nature et produit avec volumes, retards et réouvertures sur la période.</p>' },
        { t: 'Créer une action corrective', b: '<p><b>« + Ajouter une action »</b> : titre, cause racine, propriétaire (personne ou entité), échéance. Reliez les dossiers concernés.</p>' },
        { t: 'Suivre et prouver l\'efficacité', b: '<p>Faites évoluer l\'action : <b>planifiée → en cours → réalisée → vérifiée</b>. Joignez la preuve de réalisation et la mesure d\'efficacité (volumes, délais, réouvertures avant/après sur périmètre constant).</p>' }
      ]
    },
    {
      id: 'administrer', title: 'Administrer la plateforme', who: ['admin', 'conformite'], mins: 6,
      summary: 'Vue d\'ensemble, comptes, référentiels, règles de délai et leur validation, jours fériés, imports et journal d\'audit — tous accessibles depuis la barre latérale.',
      steps: [
        { t: 'Piloter depuis la vue d\'ensemble', b: '<p><b>Pilotage › Administration</b> : comptes actifs, part des comptes avec MFA, règles à valider, anomalies d\'import, activité du journal d\'audit sur 14 jours et <b>points de vigilance</b> avant mise en production (mode démonstration, MFA imposée, règles validées, comptes de démonstration, mode débogage). Chaque point mène à la rubrique concernée.</p>' },
        { t: 'Gérer les utilisateurs', b: '<p><b>Comptes et sécurité › Utilisateurs</b> : créez les comptes avec un rôle et un périmètre (agence ou entité). La <b>MFA</b> est exigée pour les profils sensibles. Désactivez plutôt que supprimer ; un compte verrouillé (échecs répétés) se débloque après 15 minutes ou par l\'administrateur.</p><div class="info"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg><div>Séparation des responsabilités : l\'administrateur ne traite pas de dossier.</div></div>' },
        { t: 'Tenir les référentiels', b: '<p><b>Référentiels</b> (barre latérale) : agences, entités de traitement, natures, produits, canaux et modèles de réponse sont <b>versionnés</b>. Désactivez une valeur obsolète au lieu de la supprimer : les dossiers historiques gardent leur libellé.</p>' },
        { t: 'Saisir une règle de délai', b: '<p><b>Règles et calendrier › Règles de délai</b> : type (accusé, réponse finale, pré-alerte, contrôle), unité (calendaire / ouvrée), durée, point de départ, <b>source</b> (juridique, interne, démonstration) et référence, date d\'effet. La règle est créée en <b>brouillon</b> puis envoyée <b>à valider</b>.</p>' },
        { t: 'Validation par la conformité', b: '<p>La conformité relit la source et <b>valide</b> la règle : elle devient applicable à sa date d\'effet. Tant qu\'une règle n\'est pas validée, l\'application affiche le bandeau <b>« Règle de démonstration — non validée par la conformité BSCA »</b>. Toute évolution crée une nouvelle version.</p>' },
        { t: 'Maintenir le calendrier des jours fériés', b: '<p><b>Règles et calendrier › Jours fériés</b> : ajoutez chaque année les jours fériés officiels (et exceptionnels) dans une nouvelle <b>version de calendrier</b>. Le calendrier de démonstration couvre 2025–2027.</p>' },
        { t: 'Importer l\'historique', b: '<p><b>Données › Imports historiques</b> : déposez un fichier CSV. L\'import est <b>idempotent</b> (empreinte SHA-256 : un même fichier importé deux fois ne crée aucun doublon). Le rapport indique lignes créées, ignorées et <b>anomalies</b>, à résoudre une par une (à traiter / résolu / ignoré).</p>' },
        { t: 'Consulter les journaux', b: '<p><b>Comptes et sécurité › Journal d\'audit</b> : les journaux (append-only) se filtrent par utilisateur, action et date. Ils sont accessibles à l\'administrateur et à la conformité.</p>' }
      ]
    }
  ];
  var JMAP = {}; J.forEach(function (j, i) { j.num = i + 1; JMAP[j.id] = j; });

  /* Statuts (ARCHITECTURE §6) */
  var S = {
    brouillon: { l: 'Brouillon', c: 'Reçue', tone: 'muted', who: ['agent_accueil', 'gestionnaire'], d: 'Saisie commencée par un agent, pas encore enregistrée. Aucune référence publique n\'est encore communiquée.', tip: 'Terminez la saisie rapidement : le délai court dès la date effective de réception.' },
    recu: { l: 'Reçu', c: 'Reçue', tone: 'info', who: ['agent_accueil', 'gestionnaire', 'responsable'], d: 'Dossier enregistré avec une référence unique. L\'accusé de réception doit être envoyé et sa preuve conservée.', tip: 'Transition automatique vers « À qualifier » après l\'enregistrement.' },
    a_qualifier: { l: 'À qualifier', c: 'Reçue', tone: 'info', who: ['agent_accueil', 'gestionnaire', 'responsable'], d: 'Nature, produit, entité de traitement, priorité, risque, montant et devise à compléter ; recherche de doublons.', tip: 'Un doublon est marqué et lié, jamais supprimé.' },
    affecte: { l: 'Affecté', c: 'En cours d\'analyse', tone: 'info', who: ['responsable'], d: 'Un propriétaire unique (et éventuellement un suppléant) est désigné ; des tâches peuvent être créées.', tip: 'Seul le responsable affecte ou réattribue.' },
    en_investigation: { l: 'En investigation', c: 'En cours d\'analyse', tone: 'info', who: ['gestionnaire', 'responsable'], d: 'Collecte des faits et des pièces, échanges avec le client, notes internes, cause provisoire.', tip: 'Choisissez toujours explicitement « message client » ou « note interne ».' },
    attente_information: { l: 'Attente d\'information', c: 'Information demandée', tone: 'warn', who: ['gestionnaire', 'responsable'], d: 'Un élément est demandé au client. L\'échéance n\'est PAS suspendue ; une date annoncée éventuelle est stockée à part.', tip: 'Relancez le client avant la pré-alerte.' },
    solution_proposee: { l: 'Solution proposée', c: 'En cours d\'analyse', tone: 'info', who: ['gestionnaire', 'responsable'], d: 'Une proposition versionnée existe : type, description, cause racine, montant, décision de fond.', tip: 'Chaque version est conservée ; rien n\'est écrasé.' },
    a_valider: { l: 'À valider', c: 'En cours d\'analyse', tone: 'warn', who: ['responsable', 'conformite'], d: 'Proposition soumise : approbation N1 par le responsable, N2 par la conformité au-delà du seuil (démo : 500 000 XAF).', tip: 'Un rejet renvoie en « Solution proposée » avec commentaire.' },
    reponse_envoyee: { l: 'Réponse envoyée', c: 'Réponse envoyée', tone: 'ok', who: ['gestionnaire', 'responsable'], d: 'Réponse finale transmise avec preuve d\'envoi ; date de réponse finale et décision de fond enregistrées.', tip: 'La date de réponse finale alimente l\'indicateur « Réponses ».' },
    cloture: { l: 'Clôturé', c: 'Clôturée', tone: 'ok', who: ['gestionnaire', 'responsable'], d: 'Mesure mise en œuvre et dossier clos. Il reste consultable et peut être réouvert.', tip: 'La clôture ne supprime rien.' },
    reouvert: { l: 'Réouvert', c: 'Réouverte', tone: 'late', who: ['client', 'gestionnaire', 'responsable'], d: 'Contestation ou nouvel élément : un dossier enfant est créé et lié à l\'original, qui reste intact.', tip: 'Le dossier enfant compte comme une nouvelle entrée dans les indicateurs.' }
  };
  var TRANS = [
    ['brouillon', 'recu'], ['recu', 'a_qualifier'], ['a_qualifier', 'affecte'], ['affecte', 'en_investigation'],
    ['en_investigation', 'attente_information'], ['en_investigation', 'solution_proposee'], ['attente_information', 'en_investigation'],
    ['solution_proposee', 'a_valider'], ['solution_proposee', 'en_investigation'], ['a_valider', 'solution_proposee'],
    ['a_valider', 'reponse_envoyee'], ['reponse_envoyee', 'cloture'], ['reponse_envoyee', 'reouvert'], ['cloture', 'reouvert'], ['reouvert', 'en_investigation']
  ];

  /* Indicateurs (ARCHITECTURE §8) */
  var KPIS = [
    { k: 'received', l: 'Réclamations reçues', d: 'Nombre de références uniques dont la date de réception est comprise dans la période (bornes incluses) et qui correspondent aux filtres actifs.', f: 'COUNT(DISTINCT référence) WHERE received_at ∈ [from ; to]', ex: 'Du 01/09 au 30/09/2026 : <b>128</b> réclamations reçues.', note: 'Un dossier réouvert (enfant) compte comme une nouvelle entrée.' },
    { k: 'responded', l: 'Réponses envoyées', d: 'Nombre de références uniques dont la date de réponse finale est comprise dans la période, quelle que soit leur date de réception.', f: 'COUNT(DISTINCT référence) WHERE final_response_at ∈ [from ; to]', ex: 'En septembre 2026 : <b>94</b> réponses, dont 23 pour des réclamations reçues en août.', note: 'Ne pas confondre avec la cohorte traitée.' },
    { k: 'cohort_treated', l: 'Cohorte reçue puis traitée', d: 'Réclamations reçues dans la période ET ayant reçu une réponse finale au plus tard à la date de calcul. La date de calcul est toujours affichée.', f: 'received_at ∈ période ET final_response_at ≤ as_of', ex: 'Sur les 128 reçues en septembre, <b>71</b> ont une réponse au 30/09/2026.', note: 'Recalculer plus tard fait augmenter ce nombre : la date de calcul compte.' },
    { k: 'stock', l: 'Stock à la date D', d: 'Réclamations reçues au plus tard à D et sans réponse finale à D (réponse absente ou postérieure à D).', f: 'received_at ≤ D ET (final_response_at IS NULL OU > D)', ex: 'Au 30/09/2026 : <b>90</b> réclamations en stock.', note: 'Une réouverture crée un dossier enfant compté comme nouvelle entrée.' },
    { k: 'treatment_rate', l: 'Taux de traitement', d: 'Cohorte traitée divisée par les réclamations reçues de la même période. Numérateur et dénominateur sont toujours affichés ; valeur à une décimale, vide si le dénominateur vaut 0.', f: 'cohort_treated / received × 100', ex: '71 / 128 = <b>55,5 %</b> au 30/09/2026.', note: 'Jamais de pourcentage sans ses deux termes.' },
    { k: 'late_open', l: 'Retard ouvert', d: 'Dossiers ouverts à la date de calcul dont l\'échéance de réponse finale est dépassée.', f: 'ouvert à as_of ET due_at < as_of', ex: 'Au 30/09/2026 : <b>6</b> dossiers ouverts en retard.', note: 'Distinct du retard clos : deux nombres séparés.' },
    { k: 'late_closed', l: 'Retard clos', d: 'Dossiers répondus dans la période dont la réponse finale est partie après l\'échéance.', f: 'final_response_at ∈ période ET final_response_at > due_at', ex: 'En septembre 2026 : <b>4</b> réponses envoyées en retard.', note: 'Mesuré sur l\'échéance initiale, jamais sur une date annoncée.' },
    { k: 'at_risk', l: 'À risque', d: 'Dossiers ouverts, pas encore en retard, dont la pré-alerte interne est atteinte (démo : 5 jours ouvrés avant l\'échéance finale).', f: 'ouvert ET NON en retard ET as_of ≥ date de pré-alerte', ex: 'Au 30/09/2026 : <b>12</b> dossiers à risque.', note: 'Sert à prioriser la file de travail.' }
  ];

  /* Matrice des droits. y = oui, p = partiel, n = non. Ordre : ROLES. */
  var DOMAINS = ['Dossiers', 'Solutions', 'Qualité', 'Pilotage', 'Administration'];
  var PERMS = [
    ['Dossiers', 'Déposer et suivre sa réclamation', 'portail public', 'y n n n n n n n', { 0: 'Portail, référence + code de suivi' }],
    ['Dossiers', 'Consulter les dossiers', 'complaints.view', 'p y y y y y n n', { 0: 'Vue client simplifiée de ses dossiers', 1: 'Son agence + ses saisies', 2: 'Propriétaire/suppléant + son entité', 3: 'Son entité', 4: 'Lecture, tous dossiers', 5: 'Lecture, tous dossiers', 6: 'Agrégats seulement' }],
    ['Dossiers', 'Enregistrer une réclamation (saisie agent)', 'complaints.create', 'p y y y n n n n', { 0: 'Via le portail uniquement' }],
    ['Dossiers', 'Qualifier (nature, produit, priorité, montant)', 'complaints.qualify', 'n y y y n n n n', {}],
    ['Dossiers', 'Affecter, réattribuer, escalader', 'complaints.assign', 'n n n y n n n n', {}],
    ['Dossiers', 'Changer le statut (transition motivée)', 'complaints.transition', 'n p y y n n n n', { 1: 'Jusqu\'à « À qualifier »' }],
    ['Dossiers', 'Échanger avec le client / notes internes', 'messages du dossier', 'p p y y n n n n', { 0: 'Messages client uniquement', 1: 'Sur les dossiers de son agence' }],
    ['Dossiers', 'Envoyer la réponse finale', 'complaints.respond', 'n n y y n n n n', {}],
    ['Dossiers', 'Réouvrir un dossier', 'complaints.reopen', 'p n y y n n n n', { 0: 'Demande de réouverture depuis le suivi' }],
    ['Dossiers', 'Télécharger les pièces', 'attachments', 'p y y y y y n n', { 0: 'Pièces visibles client uniquement' }],
    ['Dossiers', 'Exporter la liste des dossiers', 'complaints.export', 'n n n y y y p n', { 6: 'Exports agrégés, noms masqués' }],
    ['Solutions', 'Proposer une solution', 'solutions.propose', 'n n y y n n n n', {}],
    ['Solutions', 'Approuver niveau 1', 'solutions.approve_n1', 'n n n y n n n n', {}],
    ['Solutions', 'Approuver niveau 2 (≥ seuil)', 'solutions.approve_n2', 'n n n n n y n n', {}],
    ['Qualité', 'Contrôler une réponse', 'quality.control', 'n n n n y n n n', {}],
    ['Qualité', 'Gérer le plan d\'actions correctives', 'quality.manage', 'n n n p y n n n', { 3: 'Peut être propriétaire d\'une action' }],
    ['Pilotage', 'Tableau de bord', 'dashboard.view', 'n n p y y y y n', { 2: 'Son périmètre', 6: 'Agrégats, noms masqués' }],
    ['Pilotage', 'Délais et alertes', 'deadlines.view', 'n y y y y y n n', { 1: 'Son agence' }],
    ['Pilotage', 'Rapports', 'reports.view', 'n n n y y y y n', {}],
    ['Pilotage', 'Valider un rapport', 'reports.validate', 'n n n n n y n n', {}],
    ['Administration', 'Comptes utilisateurs', 'admin.users', 'n n n n n n n y', {}],
    ['Administration', 'Référentiels, modèles, calendriers', 'admin.referentials', 'n n n n n n n y', {}],
    ['Administration', 'Saisir une règle de délai', 'admin.rules', 'n n n n n n n y', {}],
    ['Administration', 'Valider une règle de délai', 'admin.rules.validate', 'n n n n n y n n', {}],
    ['Administration', 'Journaux d\'audit', 'admin.audit', 'n n n n n y n y', {}],
    ['Administration', 'Imports historiques', 'admin.imports', 'n n n n n n n y', {}]
  ];

  var ACCOUNTS = [
    ['admin@bsca.demo', 'admin', 'Référentiels, comptes, règles, imports'],
    ['accueil@bsca.demo', 'agent_accueil', 'Agence Brazzaville Centre'],
    ['gestionnaire@bsca.demo', 'gestionnaire', 'Entité Cartes et paiements'],
    ['responsable@bsca.demo', 'responsable', 'Entité Cartes et paiements'],
    ['qualite@bsca.demo', 'qualite', 'Tous les dossiers (lecture)'],
    ['conformite@bsca.demo', 'conformite', 'Tous les dossiers (lecture), audit'],
    ['direction@bsca.demo', 'direction', 'Agrégats, noms masqués'],
    ['client@bsca.demo', 'client', 'Ses propres dossiers']
  ];

  var FAQ = [
    { id: 'code-perdu', q: 'J\'ai perdu mon code de suivi. Que faire ?', a: '<p>Le code n\'est affiché qu\'une fois et la banque n\'en conserve qu\'une empreinte : elle ne peut pas le renvoyer. Contactez votre agence ou le centre de contact avec votre référence ; un agent vérifiera votre identité et vous indiquera la marche à suivre. Un client disposant d\'un compte retrouve ses dossiers dans son espace.</p>' },
    { id: 'suspension', q: 'Le délai est-il suspendu quand on attend une pièce du client ?', a: '<p>Non. L\'échéance continue de courir pendant « Attente d\'information ». Si une nouvelle date est annoncée au client, elle est enregistrée à part ; l\'échéance initiale n\'est jamais modifiée et sert à mesurer le retard.</p>' },
    { id: 'seuils', q: 'Les délais de 10 jours ouvrés et 45 jours sont-ils des engagements BSCA ?', a: '<p>Non. Ce sont des <b>valeurs de démonstration</b>. La conformité BSCA doit confirmer les textes et procédures applicables ; une règle n\'est appliquée en production qu\'après validation et versionnement de sa source.</p>' },
    { id: 'recues-reponses', q: 'Pourquoi « reçues » et « réponses » ne donnent-ils pas le même nombre ?', a: '<p>Ils ne comptent pas les mêmes dossiers : « reçues » se fonde sur la date de réception, « réponses » sur la date de réponse finale. Un dossier reçu fin août et répondu début septembre compte dans les reçues d\'août et dans les réponses de septembre. Voir l\'<a href="#indicateurs">exercice interactif</a>.</p>' },
    { id: 'supprimer', q: 'Peut-on supprimer un dossier créé par erreur ou en double ?', a: '<p>Non : aucun profil métier ne peut supprimer un dossier déposé. Un doublon est <b>marqué</b> et lié au dossier principal ; un dossier erroné est traité et clôturé avec un motif. L\'audit conserve tout.</p>' },
    { id: 'note-client', q: 'Le client peut-il voir mes notes internes ?', a: '<p>Jamais. Le portail client n\'affiche ni les notes internes, ni les noms d\'agents, ni les avis de contrôle, ni les pièces internes ou confidentielles, ni le statut interne brut.</p>' },
    { id: 'agence-entite', q: 'Quelle différence entre agence de réception et entité de traitement ?', a: '<p>L\'<b>agence de réception</b> est l\'endroit où la réclamation a été déposée (ex. Pointe-Noire Centre). L\'<b>entité de traitement</b> est la fonction qui résout le problème (ex. Cartes et paiements). Ce sont deux champs distincts, filtrables séparément.</p>' },
    { id: 'n2', q: 'Quand faut-il une validation de niveau 2 ?', a: '<p>Quand le montant de la solution atteint le seuil paramétré (démonstration : 500 000 XAF). La conformité approuve alors après le responsable (N1).</p>' },
    { id: 'reouverture', q: 'Que devient l\'ancien dossier après une réouverture ?', a: '<p>Il reste intact et consultable, avec sa réponse initiale et sa décision. La réouverture crée un dossier enfant lié, qui suit son propre cycle et ses propres échéances.</p>' },
    { id: 'direction-noms', q: 'Pourquoi la direction voit-elle des noms masqués ?', a: '<p>Le profil Direction accède aux agrégats (tableaux de bord, rapports) sans données nominatives ni pièces : les noms de clients apparaissent sous la forme « J. M*** ».</p>' },
    { id: 'montant-vide', q: 'Le montant est inconnu : dois-je saisir 0 ?', a: '<p>Non. Laissez le champ vide : un montant absent reste « inconnu », jamais égal à zéro. Tout montant saisi porte une devise (XAF par défaut).</p>' },
    { id: 'echec-envoi', q: 'L\'accusé de réception n\'a pas pu être envoyé. Que faire ?', a: '<p>L\'échec reste visible sur le dossier. Vérifiez les coordonnées avec le client, puis renvoyez l\'accusé par le même canal ou un autre. Chaque tentative est tracée.</p>' },
    { id: 'export', q: 'Que contient l\'en-tête d\'un export ?', a: '<p>La période, les filtres, la date de calcul, la version de règle de délai et l\'utilisateur qui a exporté. Chaque export est journalisé.</p>' },
    { id: 'mfa', q: 'Pourquoi me demande-t-on un code à 6 chiffres à la connexion ?', a: '<p>Les profils sensibles utilisent l\'authentification à deux facteurs (TOTP) : saisissez le code affiché par votre application d\'authentification. Après 10 échecs consécutifs, le compte est verrouillé 15 minutes.</p>' },
    { id: 'guide-hors-ligne', q: 'Ce guide fonctionne-t-il sans connexion ?', a: '<p>Oui. Il suffit d\'ouvrir <code>guide-interactif/index.html</code>. Seules les polices Manrope et DM Sans sont chargées en ligne si possible ; sinon, Arial est utilisée.</p>' }
  ];
  var INSTALL_FAQ = [
    { id: 'csrf', q: 'Erreur 419 (CSRF) ou 401 à la connexion', a: '<p>Ouvrez l\'application sur <code>http://localhost:5173</code> (pas 127.0.0.1 si le domaine n\'est pas listé), vérifiez <code>SANCTUM_STATEFUL_DOMAINS</code> et <code>SESSION_DOMAIN=null</code>, puis videz les cookies.</p>' },
    { id: 'mysql', q: 'SQLSTATE[HY000] [2002] Connection refused', a: '<p>MySQL n\'est pas démarré ou n\'écoute pas sur <code>127.0.0.1:3306</code>. Vérifiez aussi <code>DB_HOST=127.0.0.1</code> dans <code>.env</code>.</p>' },
    { id: 'reseed', q: 'Repartir d\'une base de démonstration propre', a: '<div class="code"><code>php artisan migrate:fresh --seed</code></div><p>Supprime toutes les tables de la base locale puis recharge le jeu fictif. À ne jamais lancer hors environnement local.</p>' },
    { id: 'port', q: 'Le port 5173 ou 8000 est déjà utilisé', a: '<p>Arrêtez le processus qui l\'occupe ou changez de port ; dans ce cas, mettez à jour le proxy Vite et <code>SANCTUM_STATEFUL_DOMAINS</code>.</p>' }
  ];

  /* Recommandations par profil (parcours et modules) */
  var RECO = {
    client: { j: ['deposer', 'suivre', 'reouverture'], m: ['ecrans/depot', 'cycle', 'faq'] },
    agent_accueil: { j: ['saisir', 'qualifier', 'delais'], m: ['ecrans/liste', 'cycle', 'delais'] },
    gestionnaire: { j: ['instruire', 'solution', 'reponse', 'delais', 'reouverture'], m: ['ecrans/dossier', 'cycle', 'delais'] },
    responsable: { j: ['qualifier', 'solution', 'delais', 'tableau', 'rapport'], m: ['ecrans/tableau', 'indicateurs', 'roles'] },
    qualite: { j: ['qualite', 'tableau', 'rapport', 'delais'], m: ['indicateurs', 'ecrans/tableau', 'cycle'] },
    conformite: { j: ['administrer', 'solution', 'rapport', 'delais'], m: ['delais', 'indicateurs', 'roles'] },
    direction: { j: ['tableau', 'rapport'], m: ['indicateurs', 'ecrans/tableau', 'faq'] },
    admin: { j: ['administrer'], m: ['installation', 'roles', 'delais'] }
  };

  var NAV = {
    main: [
      { r: 'accueil', l: 'Accueil', i: 'home' },
      { r: 'parcours', l: 'Parcours pas à pas', i: 'route', sub: true },
      { r: 'ecrans', l: 'Écrans commentés', i: 'screen' },
      { r: 'cycle', l: 'Cycle de vie', i: 'cycle' }
    ],
    ref: [
      { r: 'delais', l: 'Simulateur de délais', i: 'clock' },
      { r: 'indicateurs', l: 'Indicateurs', i: 'chart' },
      { r: 'roles', l: 'Rôles et droits', i: 'shield' },
      { r: 'faq', l: 'Questions fréquentes', i: 'help' }
    ],
    it: [{ r: 'installation', l: 'Installation technique', i: 'wrench' }]
  };
  var MODULE_INFO = {
    'ecrans/depot': ['Écran : dépôt client', 'Chaque zone du formulaire expliquée.', 'screen'],
    'ecrans/liste': ['Écran : liste des réclamations', 'Recherche, filtres, badges d\'échéance.', 'screen'],
    'ecrans/dossier': ['Écran : détail du dossier', 'Bandeau, chronologie, onglets.', 'screen'],
    'ecrans/tableau': ['Écran : tableau de bord', 'Indicateurs, filtres, priorités.', 'screen'],
    cycle: ['Cycle de vie', '11 statuts, transitions et vue client.', 'cycle'],
    delais: ['Simulateur de délais', 'Calculez accusé et réponse finale.', 'clock'],
    indicateurs: ['Indicateurs', 'Définitions, formules, exercice.', 'chart'],
    roles: ['Rôles et droits', 'Qui peut faire quoi.', 'shield'],
    faq: ['Questions fréquentes', 'Réponses courtes.', 'help'],
    installation: ['Installation technique', 'Prérequis, commandes, comptes.', 'wrench']
  };

  /* ------------------------------------------------------------------------
     4. État
     ------------------------------------------------------------------------ */
  var state = {
    profile: store.get('tg-guide-profile', null),
    progress: store.get('tg-guide-progress', {}),
    journeyFilter: 'reco',
    lcView: 'internal',
    lcSel: null,
    screen: 'tableau',
    firstRoute: true
  };
  if (state.profile && !ROLE[state.profile]) state.profile = null;
  function saveProgress() { store.set('tg-guide-progress', state.progress); }
  function doneSteps(id) { return state.progress[id] || []; }
  function pct(j) { return Math.round(doneSteps(j.id).length / j.steps.length * 100); }
  function isReco(jid) { return !!(state.profile && RECO[state.profile].j.indexOf(jid) >= 0); }

  /* ------------------------------------------------------------------------
     5. Navigation latérale
     ------------------------------------------------------------------------ */
  function navItem(n) {
    var reco = n.r !== 'accueil' && state.profile && RECO[state.profile].m.some(function (m) { return m.split('/')[0] === n.r; });
    return '<li><a class="nav" href="#' + n.r + '" data-route="' + n.r + '" aria-label="' + esc(n.l) + '" title="' + esc(n.l) + '">' + icon(n.i) +
      '<span class="navtext">' + esc(n.l) + '</span>' + (reco ? '<span class="reco" title="Recommandé pour votre profil"><span aria-hidden="true">★</span><span class="sr-only"> (recommandé pour vous)</span></span>' : '') + '</a>' +
      (n.sub ? '<ul class="subnav" id="subnavJourneys"></ul>' : '') + '</li>';
  }
  function renderNav() {
    $('#navMain').innerHTML = NAV.main.map(navItem).join('');
    $('#navRef').innerHTML = NAV.ref.map(navItem).join('');
    $('#navIt').innerHTML = NAV.it.map(navItem).join('');
    var list = state.profile ? J.filter(function (j) { return isReco(j.id); }) : [];
    $('#subnavJourneys').innerHTML = list.map(function (j) {
      return '<li><a href="#parcours/' + j.id + '" data-route="parcours/' + j.id + '"><span class="star" aria-hidden="true">★</span>' + esc(j.title) + '</a></li>';
    }).join('');
    if (!list.length) $('#subnavJourneys').remove();
  }
  function markNav(route) {
    var base = route.split('/')[0];
    $$('.side a[data-route]').forEach(function (a) {
      var r = a.getAttribute('data-route');
      var on = a.classList.contains('nav') ? r === base : route.indexOf(r) === 0;
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ------------------------------------------------------------------------
     6. Profil / accueil
     ------------------------------------------------------------------------ */
  function renderProfiles() {
    $('#profiles').innerHTML = ROLES.map(function (r) {
      var on = state.profile === r.id;
      return '<button type="button" class="profile-card" data-profile="' + r.id + '" aria-pressed="' + on + '">' +
        '<span class="check badge ok">' + icon('check') + 'Choisi</span>' +
        '<span class="p-icon">' + icon(r.icon, 'lg') + '</span><strong>' + esc(r.label) + '</strong>' +
        '<span class="desc">' + esc(r.desc) + '</span></button>';
    }).join('');
    var p = state.profile && ROLE[state.profile];
    $('#profileAvatar').textContent = p ? p.ini : '?';
    $('#profileLabel').textContent = p ? p.label : 'Choisir un profil';
    $('#profilePill').setAttribute('aria-label', p ? 'Profil actif : ' + p.long + '. Changer de profil' : 'Choisir un profil');
    renderReco();
  }
  function renderReco() {
    var z = $('#recoZone');
    if (!state.profile) {
      z.innerHTML = '<div class="info">' + icon('info') + '<div>Choisissez un profil pour afficher vos parcours recommandés. Vous pouvez aussi <a href="#parcours">parcourir tous les parcours</a>.</div></div>';
      return;
    }
    var p = ROLE[state.profile], rc = RECO[state.profile];
    z.innerHTML = '<div class="card"><div class="row between"><div><div class="eyebrow">Votre parcours · ' + esc(p.long) + '</div>' +
      '<h2 class="mb0">Ce qui compte pour vous</h2></div><button type="button" class="btn text" id="clearProfile">Effacer le profil</button></div>' +
      '<p class="muted mt1"><b>Périmètre :</b> ' + esc(p.scope) + '</p>' +
      '<div class="journey-cards mt2">' + rc.j.map(function (id) { return journeyCard(JMAP[id]); }).join('') + '</div>' +
      '<h3 class="mt3">Modules utiles</h3><div class="quick">' + rc.m.map(function (m) {
        var mi = MODULE_INFO[m]; return '<a class="card" href="#' + m + '"><span class="q-ic">' + icon(mi[2]) + '</span><span><b>' + esc(mi[0]) + '</b><span>' + esc(mi[1]) + '</span></span></a>';
      }).join('') + '</div></div>';
    $('#clearProfile').addEventListener('click', function () { setProfile(null); });
  }
  function setProfile(id) {
    state.profile = id;
    if (id) store.set('tg-guide-profile', id); else store.del('tg-guide-profile');
    state.journeyFilter = id ? 'reco' : 'all';
    renderProfiles(); renderNav(); renderJourneyList(); markNav(currentRoute());
    if (id) toast('Guide personnalisé pour le profil « ' + ROLE[id].label + ' ».');
  }
  function renderQuick() {
    var items = [['parcours', 'Parcours pas à pas', '13 tutoriels guidés avec progression.', 'route'], ['ecrans', 'Écrans commentés', 'Points chauds sur 4 écrans clés.', 'screen'],
      ['cycle', 'Cycle de vie', 'Les 11 statuts et leurs transitions.', 'cycle'], ['delais', 'Simulateur de délais', 'Accusé et réponse finale, jour par jour.', 'clock'],
      ['indicateurs', 'Indicateurs', 'Définitions précises et exercice.', 'chart'], ['roles', 'Rôles et droits', 'Matrice filtrable.', 'shield'],
      ['installation', 'Installation', 'Pour les équipes IT.', 'wrench'], ['faq', 'FAQ', '15 questions fréquentes.', 'help']];
    $('#quickLinks').innerHTML = items.map(function (x) {
      return '<a class="card" href="#' + x[0] + '"><span class="q-ic">' + icon(x[3]) + '</span><span><b>' + x[1] + '</b><span>' + x[2] + '</span></span></a>';
    }).join('');
  }

  /* ------------------------------------------------------------------------
     7. Parcours : liste et stepper
     ------------------------------------------------------------------------ */
  function journeyCard(j) {
    var p = pct(j), reco = isReco(j.id);
    return '<a class="journey-card' + (reco ? ' is-reco' : '') + '" href="#parcours/' + j.id + '">' +
      '<div class="jc-top"><span class="jc-num">PARCOURS ' + (j.num < 10 ? '0' : '') + j.num + '</span>' +
      (p === 100 ? '<span class="badge ok">' + icon('check') + 'Terminé</span>' : (reco ? '<span class="badge warn">' + icon('star') + 'Pour vous</span>' : '')) + '</div>' +
      '<h3>' + esc(j.title) + '</h3><p>' + esc(j.summary) + '</p>' +
      '<div class="meter" role="img" aria-label="Progression ' + p + ' %"><i style="width:' + p + '%"></i></div>' +
      '<div class="jc-foot"><span>' + j.steps.length + ' étapes · ' + j.mins + ' min</span><span>' + p + ' %</span></div></a>';
  }
  function renderJourneyList() {
    var chips = [['all', 'Tous']].concat(state.profile ? [['reco', 'Recommandés pour moi']] : []).concat(ROLES.map(function (r) { return [r.id, r.label]; }));
    if (state.journeyFilter === 'reco' && !state.profile) state.journeyFilter = 'all';
    $('#journeyFilter').innerHTML = chips.map(function (c) {
      return '<button type="button" class="chip" data-jf="' + c[0] + '" aria-pressed="' + (state.journeyFilter === c[0]) + '">' + esc(c[1]) + '</button>';
    }).join('');
    var f = state.journeyFilter;
    var list = J.filter(function (j) { return f === 'all' || (f === 'reco' ? isReco(j.id) : j.who.indexOf(f) >= 0); });
    list.sort(function (a, b) { return (isReco(b.id) - isReco(a.id)) || a.num - b.num; });
    $('#journeyList').innerHTML = list.map(journeyCard).join('') || '<div class="empty-state">' + icon('search') + '<p>Aucun parcours pour ce filtre.</p></div>';
  }

  function renderJourney(id, stepN) {
    var j = JMAP[id];
    var box = $('#journeyDetail');
    if (!j) { box.innerHTML = '<div class="empty-state">' + icon('warn') + '<h1>Parcours introuvable</h1><p><a href="#parcours">Revenir à la liste des parcours</a></p></div>'; return; }
    var total = j.steps.length;
    var cur = Math.min(Math.max(parseInt(stepN, 10) || 1, 1), total + 1); // total+1 = écran de fin
    var done = doneSteps(id);
    var who = j.who.map(function (w) { return '<span class="badge info">' + icon(ROLE[w].icon) + esc(ROLE[w].label) + '</span>'; }).join('');
    var nav = j.steps.map(function (s, i) {
      var n = i + 1, isDone = done.indexOf(i) >= 0;
      return '<li class="' + (isDone ? 'done' : '') + '"><button type="button" data-step="' + n + '"' + (n === cur ? ' aria-current="step"' : '') + '>' +
        '<span class="dot">' + (isDone ? icon('check', 'sm') : n) + '</span><span class="st-title">' + esc(s.t) + (isDone ? '<span class="sr-only"> (compris)</span>' : '') + '</span></button></li>';
    }).join('');
    var panels = j.steps.map(function (s, i) {
      var n = i + 1, isDone = done.indexOf(i) >= 0;
      var shot = s.screen ? '<p class="mt2"><a class="btn alt sm" href="#ecrans/' + s.screen + '">' + icon('screen', 'sm') + 'Voir cette zone sur l\'écran commenté</a></p>' : '';
      return '<article class="card step-panel" data-panel="' + n + '"' + (n === cur ? '' : ' hidden') + ' aria-labelledby="st-' + id + '-' + n + '">' +
        '<div class="step-kicker">Étape ' + n + ' sur ' + total + '</div><h2 id="st-' + id + '-' + n + '" tabindex="-1">' + esc(s.t) + '</h2>' +
        '<div class="step-body">' + s.b + '</div>' + shot +
        '<label class="understood"><input type="checkbox" data-understood="' + i + '"' + (isDone ? ' checked' : '') + '> J\'ai compris cette étape</label>' +
        '<div class="step-actions">' +
        (n > 1 ? '<a class="btn alt" href="#parcours/' + id + '/' + (n - 1) + '">' + icon('arrowL', 'sm') + 'Précédent</a>' : '<a class="btn alt" href="#parcours">' + icon('arrowL', 'sm') + 'Tous les parcours</a>') +
        '<a class="btn" href="#parcours/' + id + '/' + (n + 1) + '">' + (n === total ? 'Terminer' : 'Suivant') + icon('arrowR', 'sm') + '</a></div></article>';
    }).join('');
    var idx = J.indexOf(j), nextJ = J[idx + 1];
    var endPanel = '<article class="card step-panel journey-done" data-panel="' + (total + 1) + '"' + (cur === total + 1 ? '' : ' hidden') + ' aria-labelledby="st-' + id + '-end">' +
      '<div class="big">' + icon('check', 'lg') + '</div><h2 id="st-' + id + '-end" tabindex="-1">Parcours terminé</h2>' +
      '<p class="muted" id="endSummary"></p><div class="row" style="justify-content:center">' +
      '<a class="btn alt" href="#parcours/' + id + '/1">Revoir depuis le début</a>' +
      (nextJ ? '<a class="btn" href="#parcours/' + nextJ.id + '">Parcours suivant : ' + esc(nextJ.title) + '</a>' : '<a class="btn" href="#parcours">Tous les parcours</a>') + '</div></article>';

    box.innerHTML = '<div class="eyebrow">Parcours ' + (j.num < 10 ? '0' : '') + j.num + ' · ' + j.mins + ' min</div>' +
      '<div class="heading"><div><h1 id="h-journey" tabindex="-1">' + esc(j.title) + '</h1><p class="sub">' + esc(j.summary) + '</p><div class="who" aria-label="Profils concernés">' + who + '</div></div></div>' +
      '<div class="journey-layout"><aside class="card stepper-nav" aria-label="Étapes du parcours">' +
      '<div class="progress-head"><span id="progLabel"></span><span id="progPct"></span></div>' +
      '<div class="progress" role="progressbar" aria-label="Étapes comprises" aria-valuemin="0" aria-valuemax="' + total + '" id="progBar"><i></i></div>' +
      '<ol>' + nav + '</ol></aside><div>' + panels + endPanel + '</div></div>';
    updateProgress(j);

    $$('[data-step]', box).forEach(function (b) { b.addEventListener('click', function () { location.hash = 'parcours/' + id + '/' + b.getAttribute('data-step'); }); });
    $$('[data-understood]', box).forEach(function (cb) {
      cb.addEventListener('change', function () {
        var i = +cb.getAttribute('data-understood'); var arr = doneSteps(id).slice();
        if (cb.checked) { if (arr.indexOf(i) < 0) arr.push(i); } else arr = arr.filter(function (x) { return x !== i; });
        state.progress[id] = arr; saveProgress();
        var li = $$('.stepper-nav li', box)[i]; li.classList.toggle('done', cb.checked);
        $('.dot', li).innerHTML = cb.checked ? icon('check', 'sm') : String(i + 1);
        updateProgress(j);
        if (arr.length === total) toast('Bravo : toutes les étapes de ce parcours sont comprises.');
      });
    });
  }
  function updateProgress(j) {
    var d = doneSteps(j.id).length, t = j.steps.length, p = Math.round(d / t * 100);
    var bar = $('#progBar'); if (!bar) return;
    bar.setAttribute('aria-valuenow', d); bar.setAttribute('aria-valuetext', d + ' étape(s) comprise(s) sur ' + t);
    $('i', bar).style.width = p + '%';
    $('#progLabel').textContent = d + ' / ' + t + ' étapes comprises';
    $('#progPct').textContent = p + ' %';
    var es = $('#endSummary');
    if (es) es.textContent = d === t ? 'Vous avez validé les ' + t + ' étapes. Votre progression est enregistrée sur cet appareil.' : 'Vous avez validé ' + d + ' étape(s) sur ' + t + '. Cochez « J\'ai compris » sur les étapes restantes pour compléter le parcours.';
  }

  /* ------------------------------------------------------------------------
     8. Écrans commentés (mini-maquettes + points chauds)
     ------------------------------------------------------------------------ */
  var MOCK_TOP = '<div class="m-top m-zone" data-z="2"><img src="assets/bsca-wide.png" alt=""><span class="m-row"><span class="m-pill m-hide-sm">Espace supervision</span><span class="m-pill">BS</span></span></div>';
  function mockApp(url, sideOn, body, withTopHs) {
    var side = '<div class="m-side' + (withTopHs ? ' m-zone" data-z="1"' : '"') + '><img class="m-mark" src="assets/bsca-mark.png" alt="">' +
      [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<i class="' + (i === sideOn ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    return '<div class="mock" aria-hidden="false"><div class="mock-chrome" aria-hidden="true"><i></i><i></i><i></i><span>' + url + '</span></div>' +
      '<div class="m-app">' + side + '<div class="m-main">' + (withTopHs ? MOCK_TOP : MOCK_TOP.replace(' m-zone" data-z="2"', '"')) + '<div class="m-body">' + body + '</div></div></div></div>';
  }
  var SCREENS = {
    tableau: {
      l: 'Tableau de bord', url: 'localhost:5173/tableau-de-bord',
      html: function () {
        return mockApp('localhost:5173/tableau-de-bord', 0,
          '<div class="m-row"><div><div class="m-eyebrow">Supervision</div><p class="m-h">Bonjour, équipe BSCA</p></div><span class="m-btn">+ Nouvelle réclamation</span></div>' +
          '<div class="m-banner m-zone" data-z="8">⚠ Règle de démonstration — non validée par la conformité BSCA</div>' +
          '<div class="m-filters m-zone" data-z="3"><span>01/09 → 30/09/2026</span><span>Toutes les agences</span><span>Toutes les entités</span><span>Calcul au 30/09</span></div>' +
          '<div class="m-kpis m-zone" data-z="4">' +
          [['Reçues', '128', 'Période'], ['Réponses', '94', 'Période'], ['Stock', '90', 'Au 30/09'], ['À risque', '12', 'Pré-alerte']].map(function (k) {
            return '<div class="m-card m-kpi"><small>' + k[0] + ' ⓘ</small><b>' + k[1] + '</b><em>' + k[2] + '</em></div>';
          }).join('') + '</div>' +
          '<div class="m-grid2"><div class="m-card m-zone" data-z="5"><b>Évolution mensuelle</b><div class="m-bars">' +
          [[60, 52], [81, 69], [72, 75], [91, 70], [82, 76], [95, 81]].map(function (v) { return '<div><i style="height:' + v[0] + '%"></i><i class="r" style="height:' + v[1] + '%"></i></div>'; }).join('') +
          '</div><small style="color:#5A6B7B">Résumé : les réponses suivent les entrées avec un écart moyen de 10 %.</small></div>' +
          '<div class="m-card m-zone" data-z="6"><b>Nature des demandes</b>' +
          [['Cartes', 85, 42], ['Virements', 57, 28], ['Comptes', 45, 22], ['Digital', 35, 17]].map(function (r) { return '<div class="m-hbar"><span>' + r[0] + '</span><span><i style="width:' + r[1] + '%"></i></span><b>' + r[2] + '</b></div>'; }).join('') + '</div></div>' +
          '<div class="m-card m-zone" data-z="7"><b>Priorités du jour</b><table class="m-table"><tr><th>Référence</th><th>Objet</th><th>Échéance</th></tr>' +
          '<tr><td><b>TG-BSCA-2026-000013</b></td><td>Virement contesté</td><td><span class="m-badge late">▲ En retard</span></td></tr>' +
          '<tr><td><b>TG-BSCA-2026-000018</b></td><td>Paiement carte</td><td><span class="m-badge warn">◷ À risque</span></td></tr></table></div>', true);
      },
      hs: [
        ['Barre latérale', 'Accès aux modules selon vos droits. La section active est marquée d\'un filet rouge ; sous 1 080 px la barre se replie en icônes, sous 700 px elle devient un menu.'],
        ['Bandeau BSCA', 'Logo officiel (jamais déformé ni recolorié), espace de travail et profil connecté.'],
        ['Filtres partagés', 'Période, agence de réception, entité de traitement, date de calcul. Les mêmes filtres s\'appliquent aux listes, rapports et exports.'],
        ['Quatre indicateurs définis', 'Reçues, réponses, stock, à risque. Chaque carte affiche sa période ou sa date de calcul, et une définition accessible (ⓘ).'],
        ['Évolution mensuelle', 'Reçues (bleu) et réponses (rouge) par mois, avec un résumé textuel pour les lecteurs d\'écran.'],
        ['Nature des demandes', 'Répartition par nature sur la période filtrée ; le motif dominant apparaît en premier.'],
        ['Priorités du jour', 'Les dossiers les plus urgents, avec un signal d\'échéance en texte + icône. Un clic ouvre le dossier.'],
        ['Bandeau de règle', 'Affiché tant que la règle de délai appliquée est une règle de démonstration non validée par la conformité BSCA.']
      ]
    },
    liste: {
      l: 'Liste des réclamations', url: 'localhost:5173/reclamations',
      html: function () {
        return mockApp('localhost:5173/reclamations?statut=a_qualifier', 1,
          '<div class="m-row"><div><div class="m-eyebrow">Traitement</div><p class="m-h">Toutes les réclamations</p></div><span class="m-row"><span class="m-btn alt m-zone" data-z="5">⤓ Exporter</span><span class="m-btn m-zone" data-z="7">+ Enregistrer un dossier</span></span></div>' +
          '<div class="m-filters"><span class="m-zone" data-z="1" style="min-width:150px">🔍 Référence, objet, client</span><span class="m-zone" data-z="2">Agence · Entité · Statut · Échéance</span></div>' +
          '<div class="m-card m-zone" data-z="3" style="padding:0;overflow:hidden"><table class="m-table"><tr><th>Référence ▾</th><th>Objet</th><th class="m-hide-sm">Agence</th><th class="m-hide-sm">Entité</th><th>Statut</th><th>Échéance</th></tr>' +
          '<tr><td><b>…000013</b></td><td>Virement contesté</td><td class="m-hide-sm">Brazzaville Centre</td><td class="m-hide-sm">Virements</td><td>En investigation</td><td><span class="m-badge late m-zone" data-z="4">▲ En retard</span></td></tr>' +
          '<tr><td><b>…000018</b></td><td>Paiement carte</td><td class="m-hide-sm">—</td><td class="m-hide-sm">Cartes et paiements</td><td>À valider</td><td><span class="m-badge warn">◷ À risque</span></td></tr>' +
          '<tr><td><b>…000020</b></td><td>Frais de compte</td><td class="m-hide-sm">Pointe-Noire Centre</td><td class="m-hide-sm">Comptes</td><td>À qualifier</td><td><span class="m-badge ok">✓ Dans les délais</span></td></tr>' +
          '<tr><td><b>…000025</b></td><td>Retrait contesté</td><td class="m-hide-sm">Dolisie</td><td class="m-hide-sm">Cartes et paiements</td><td>Réponse envoyée</td><td><span class="m-badge ok">✓ Dans les délais</span></td></tr></table></div>' +
          '<div class="m-row m-zone" data-z="6" style="color:#5A6B7B"><span>4 dossiers fictifs sur 240 · page 1 / 60</span><span>‹ 1 2 3 … ›</span></div>');
      },
      hs: [
        ['Recherche', 'Par référence, objet ou nom du client. Les résultats se mettent à jour pendant la saisie.'],
        ['Filtres', 'Agence de réception et entité de traitement sont deux filtres distincts, plus statut, nature, période et signal d\'échéance. Les filtres actifs restent visibles.'],
        ['Tableau triable', 'Tri par référence, réception, statut, échéance ou priorité. Sur mobile, chaque ligne devient une carte lisible.'],
        ['Signal d\'échéance', 'Toujours un mot + une icône + une couleur : Dans les délais, À risque, En retard, Clos en retard, Règle à valider.'],
        ['Export traçable', 'CSV, Excel ou PDF avec, en en-tête, la période, les filtres, la date de calcul, la version de règle et l\'utilisateur. Journalisé.'],
        ['Compteur et pagination', 'Nombre de résultats pour la sélection courante ; jusqu\'à 100 lignes par page.'],
        ['Enregistrer un dossier', 'Saisie d\'une réclamation reçue en agence, par téléphone, courriel ou courrier (action principale, en rouge).']
      ]
    },
    dossier: {
      l: 'Détail du dossier', url: 'localhost:5173/reclamations/18',
      html: function () {
        return mockApp('localhost:5173/reclamations/18', 1,
          '<div class="m-card m-zone" data-z="1"><div class="m-row"><div><div class="m-eyebrow">Dossier fictif</div><p class="m-h">TG-BSCA-2026-000018</p><small style="color:#5A6B7B">Paiement par carte contesté · Portail</small></div>' +
          '<span class="m-row"><span class="m-badge info">En investigation</span><span class="m-badge warn">◷ À risque · 26/10</span></span></div>' +
          '<div class="m-row" style="margin-top:6px;color:#5A6B7B"><span>Propriétaire : A. Mabiala</span><span class="m-row m-zone" data-z="3"><span class="m-btn alt">Attente d\'info</span><span class="m-btn">Proposer une solution</span></span></div></div>' +
          '<div class="m-grid2"><div style="display:grid;gap:8px;min-width:0">' +
          '<div class="m-card m-zone" data-z="2" style="border-left:3px solid #D9132C"><b>Prochaine action</b><br><span style="color:#5A6B7B">Vérifier l\'opération et soumettre une proposition au responsable.</span></div>' +
          '<div class="m-card"><div class="m-tabs m-zone" data-z="4"><span class="on">Faits</span><span>Pièces (3)</span><span>Échanges</span><span>Solution</span><span>Contrôle</span><span>Audit</span></div>' +
          '<div class="m-tl m-zone" data-z="5"><div><b>Demande enregistrée</b><small>12/09/2026 · client</small></div><div><b>Accusé envoyé</b><small>12/09/2026 · e-mail · preuve</small></div><div class="int"><b>🔒 Note interne</b><small>15/09/2026 · visible équipe seulement</small></div><div><b>Affecté à A. Mabiala</b><small>14/09/2026 · motif : entité Cartes</small></div></div></div>' +
          '<div class="m-card m-zone" data-z="8"><div class="m-row"><span class="m-badge info">✉ Message au client</span><span class="m-badge warn">🔒 Note interne</span></div><div class="m-field" style="margin-top:6px"><i class="tall"></i></div></div>' +
          '</div><div style="display:grid;gap:8px;align-content:start;min-width:0">' +
          '<div class="m-card m-zone" data-z="6"><b>Fiche</b><div class="m-kv"><span>Canal</span><b>Portail</b></div><div class="m-kv"><span>Agence de réception</span><b>—</b></div><div class="m-kv"><span>Entité de traitement</span><b>Cartes et paiements</b></div><div class="m-kv"><span>Montant</span><b>85 000 XAF</b></div><div class="m-kv"><span>Décision</span><b>À déterminer</b></div></div>' +
          '<div class="m-card m-zone" data-z="7"><b>Échéances</b><div class="m-kv"><span>Accusé</span><b>✓ 12/09</b></div><div class="m-kv"><span>Réponse finale</span><b>27/10/2026</b></div><div class="m-kv"><span>Date annoncée</span><b>—</b></div></div>' +
          '</div></div>');
      },
      hs: [
        ['Bandeau du dossier', 'Référence, objet, canal, statut, signal d\'échéance et propriétaire, toujours visibles en haut du dossier.'],
        ['Prochaine action', 'Texte calculé par l\'application selon le statut et les échéances : ce qu\'il faut faire maintenant.'],
        ['Actions autorisées', 'Seules les transitions permises par le serveur pour votre rôle apparaissent. Chacune demande un motif.'],
        ['Onglets', 'Faits, Pièces, Échanges, Solution, Contrôle, Audit : une vue unifiée du dossier.'],
        ['Chronologie', 'Événements horodatés, jamais modifiés. Les éléments internes (ambre, cadenas) ne sont jamais publiés au client.'],
        ['Fiche de suivi', 'Agence de réception et entité de traitement distinctes ; montant toujours avec devise ; décision de fond séparée du statut.'],
        ['Échéances', 'Échéance initiale (jamais modifiée) et date annoncée au client, distinctes. Accusé avec preuve d\'envoi.'],
        ['Rédaction', 'Choix explicite entre « Message au client » (visible sur son suivi) et « Note interne » (équipe seulement).']
      ]
    },
    depot: {
      l: 'Dépôt client', url: 'bsca.example/reclamation',
      html: function () {
        return '<div class="mock"><div class="mock-chrome" aria-hidden="true"><i></i><i></i><i></i><span>portail client · Déposer une réclamation</span></div>' +
          '<div class="m-top"><img src="assets/bsca-wide.png" alt=""><span class="m-pill">Espace client</span></div>' +
          '<div class="m-body" style="max-width:640px;margin:0 auto">' +
          '<div class="m-steps m-zone" data-z="1"><span class="done">1 Identité</span><span class="done">2 Objet</span><span class="done">3 Faits</span><span class="on">4 Pièces</span><span>5 Vérification</span><span>6 Confirmation</span></div>' +
          '<div class="m-card m-zone" data-z="2"><b>Vos coordonnées</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px"><label class="m-field">Nom<i></i></label><label class="m-field">E-mail<i></i></label><label class="m-field">Produit<i></i></label><label class="m-field">Réponse par<i></i></label></div></div>' +
          '<div class="m-drop m-zone" data-z="3">⤒ Ajouter des justificatifs — PDF, JPG, PNG · 5 fichiers · 10 Mo max.<br><small>releve-aout.pdf ✓ analysé</small></div>' +
          '<div class="m-card m-zone" data-z="4"><span>☑ J\'accepte que mes données soient traitées pour instruire ma réclamation.</span></div>' +
          '<div class="m-card m-zone" data-z="5" style="border:2px solid #11734D"><b style="color:#11734D">✓ Réclamation enregistrée</b><div class="m-kv"><span>Référence</span><b>TG-BSCA-2026-000241</b></div><div class="m-kv"><span>Code de suivi (affiché une seule fois)</span><b>K7Q2-M9XA</b></div></div>' +
          '<div class="m-card m-zone" data-z="6"><div class="m-kv"><span>Accusé de réception prévu</span><b>au plus tard le 12/10/2026</b></div><div class="m-kv"><span>Réponse prévue</span><b>au plus tard le 12/11/2026</b></div><div class="m-banner" style="margin-top:6px">Délais indicatifs de démonstration</div></div>' +
          '</div></div>';
      },
      hs: [
        ['Barre d\'étapes', 'Six étapes courtes : Identité, Objet, Faits, Pièces, Vérification, Confirmation. L\'étape courante est soulignée en rouge, les étapes faites en vert avec coche.'],
        ['Champs', 'Libellés toujours visibles, aide sous le champ, erreurs en texte clair à côté du champ concerné. Utilisable au clavier et sur téléphone.'],
        ['Justificatifs', 'Jusqu\'à 5 fichiers PDF, JPG ou PNG de 10 Mo maximum, analysés avant d\'être accessibles aux équipes.'],
        ['Consentement', 'Obligatoire pour déposer. Le texte explique l\'usage des données en une phrase.'],
        ['Confirmation', 'Référence et code de suivi. Le code n\'est affiché qu\'une fois : le client est invité à le noter ou l\'imprimer.'],
        ['Délais annoncés', 'Dates prévisionnelles d\'accusé et de réponse, avec la mention « démonstration » tant que la règle n\'est pas validée.']
      ]
    }
  };
  var SCREEN_ORDER = ['tableau', 'liste', 'dossier', 'depot'];

  function renderScreenTabs() {
    $('#screenTabs').innerHTML = SCREEN_ORDER.map(function (k) {
      return '<button type="button" class="tab" role="tab" id="tab-' + k + '" aria-controls="screenPanel" data-screen="' + k + '" aria-selected="' + (state.screen === k) + '" tabindex="' + (state.screen === k ? 0 : -1) + '">' + esc(SCREENS[k].l) + '</button>';
    }).join('');
  }
  function renderScreen(k, hsN) {
    if (!SCREENS[k]) k = 'tableau';
    state.screen = k; renderScreenTabs();
    var s = SCREENS[k];
    var panel = $('#screenPanel');
    panel.setAttribute('aria-labelledby', 'tab-' + k);
    panel.innerHTML = '<div class="mock-layout"><figure class="mt0" style="margin:0"><div id="mockHost">' + s.html() + '</div>' +
      '<figcaption class="small muted mt1">Reproduction simplifiée · données fictives · ' + s.hs.length + ' zones commentées</figcaption></figure>' +
      '<div class="card hs-panel"><div class="hs-detail" id="hsDetail" aria-live="polite"></div><hr><h3 class="small muted" style="letter-spacing:1px;text-transform:uppercase">Toutes les zones</h3><ol id="hsList">' +
      s.hs.map(function (h, i) { return '<li><button type="button" data-hs="' + (i + 1) + '" aria-pressed="false"><span class="hs-num" aria-hidden="true">' + (i + 1) + '</span><span><b>' + esc(h[0]) + '</b><span class="t">' + esc(h[1]) + '</span></span></button></li>'; }).join('') +
      '</ol></div></div>';
    /* Insère les pastilles dans les zones */
    $$('#mockHost .m-zone').forEach(function (z) {
      var n = +z.getAttribute('data-z'); var h = s.hs[n - 1]; if (!h) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hs'; b.textContent = n;
      b.setAttribute('data-hs', n); b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Zone ' + n + ' : ' + h[0]);
      z.appendChild(b);
    });
    $$('#screenPanel [data-hs]').forEach(function (b) {
      b.addEventListener('click', function () { var n = b.getAttribute('data-hs'); selectHotspot(n); history.replaceState(null, '', '#ecrans/' + k + '/' + n); });
    });
    selectHotspot(hsN || 1, !!hsN);
  }
  function selectHotspot(n, scroll) {
    var s = SCREENS[state.screen]; n = Math.min(Math.max(+n || 1, 1), s.hs.length); var h = s.hs[n - 1];
    $('#hsDetail').innerHTML = '<div class="eyebrow">Zone ' + n + ' sur ' + s.hs.length + '</div><h3><span class="hs-num" aria-hidden="true">' + n + '</span>' + esc(h[0]) + '</h3><p class="mb0">' + esc(h[1]) + '</p>' +
      '<div class="row mt2"><button type="button" class="btn alt sm" id="hsPrev"' + (n === 1 ? ' disabled' : '') + '>' + icon('arrowL', 'sm') + 'Zone précédente</button><button type="button" class="btn alt sm" id="hsNext"' + (n === s.hs.length ? ' disabled' : '') + '>Zone suivante' + icon('arrowR', 'sm') + '</button></div>';
    $$('#screenPanel [data-hs]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-hs') === n)); });
    $$('#mockHost .m-zone').forEach(function (z) { z.classList.toggle('hl', +z.getAttribute('data-z') === n); });
    $('#hsPrev').addEventListener('click', function () { selectHotspot(n - 1); history.replaceState(null, '', '#ecrans/' + state.screen + '/' + (n - 1)); });
    $('#hsNext').addEventListener('click', function () { selectHotspot(n + 1); history.replaceState(null, '', '#ecrans/' + state.screen + '/' + (n + 1)); });
    if (scroll) { var z = $('#mockHost .m-zone[data-z="' + n + '"]'); if (z) z.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }); }
  }

  /* ------------------------------------------------------------------------
     9. Cycle de vie : diagramme SVG interactif
     ------------------------------------------------------------------------ */
  var W = 170, H = 56;
  var POS = {
    brouillon: [20, 40], recu: [212, 40], a_qualifier: [404, 40], affecte: [596, 40], en_investigation: [788, 40],
    attente_information: [596, 160], solution_proposee: [788, 280], a_valider: [596, 280], reponse_envoyee: [404, 280], cloture: [212, 280], reouvert: [404, 400]
  };
  var EDGES = [
    ['brouillon', 'recu', 'M190 68H210'], ['recu', 'a_qualifier', 'M382 68H402'], ['a_qualifier', 'affecte', 'M574 68H594'], ['affecte', 'en_investigation', 'M766 68H786'],
    ['en_investigation', 'attente_information', 'M808 96V180H768'], ['attente_information', 'en_investigation', 'M768 204H846V98', 1],
    ['en_investigation', 'solution_proposee', 'M885 96V278'], ['solution_proposee', 'en_investigation', 'M935 280V98', 1],
    ['solution_proposee', 'a_valider', 'M788 300H768'], ['a_valider', 'solution_proposee', 'M766 322H786', 1],
    ['a_valider', 'reponse_envoyee', 'M596 308H576'], ['reponse_envoyee', 'cloture', 'M404 308H384'],
    ['reponse_envoyee', 'reouvert', 'M489 336V398'], ['cloture', 'reouvert', 'M297 336V428H402'], ['reouvert', 'en_investigation', 'M574 428H980V68H960']
  ];
  function renderLifecycle() {
    var toneColor = { muted: 'var(--muted)', info: 'var(--blue)', warn: 'var(--warn)', ok: 'var(--success)', late: 'var(--danger)' };
    var client = state.lcView === 'client';
    var svg = '<svg class="lc-svg" viewBox="0 0 1000 470" role="group" aria-labelledby="lcTitle lcDesc">' +
      '<title id="lcTitle">Diagramme des 11 statuts de traitement</title><desc id="lcDesc">Chaîne principale : Brouillon, Reçu, À qualifier, Affecté, En investigation, Solution proposée, À valider, Réponse envoyée, Clôturé. Boucles : attente d\'information, retour en investigation, réouverture. Utilisez Tab puis Entrée sur un statut pour afficher son détail.</desc>' +
      '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="lc-arrow"/></marker>' +
      '<marker id="arrHot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#D9132C"/></marker></defs>' +
      /* Couloir décision */
      '<g aria-hidden="true"><rect class="lc-lane" x="20" y="124" width="550" height="118" rx="12"/><text class="lc-lane-title" x="36" y="148">DÉCISION DE FOND · DIMENSION DISTINCTE DU STATUT</text>' +
      [['Fondée', 36, 160], ['Partiellement fondée', 296, 160], ['Non fondée', 36, 200], ['Irrecevable motivée', 296, 200]].map(function (d) {
        return '<g class="lc-dec"><rect x="' + d[1] + '" y="' + d[2] + '" width="244" height="30" rx="8"/><text x="' + (d[1] + 14) + '" y="' + (d[2] + 20) + '">' + d[0] + '</text></g>';
      }).join('') +
      '<path d="M489 280V244" class="lc-edge back" /><text class="lc-edge-label" x="497" y="264">copiée à l\'envoi</text></g>' +
      '<g aria-hidden="true">' + EDGES.map(function (e, i) {
        return '<path id="edge' + i + '" class="lc-edge' + (e[3] ? ' back' : '') + '" d="' + e[2] + '" marker-end="url(#arr)" data-from="' + e[0] + '" data-to="' + e[1] + '"/>';
      }).join('') + '<text class="lc-edge-label" x="760" y="420">reprise de l\'instruction</text></g>' +
      Object.keys(POS).map(function (k) {
        var p = POS[k], s = S[k];
        var main = client ? s.c : s.l, sub = client ? 'Statut interne : ' + s.l : 'Client : ' + s.c;
        return '<g class="lc-node tone-' + s.tone + '" data-status="' + k + '" tabindex="0" role="button" aria-pressed="false" aria-label="' + esc(s.l + ' (vu par le client : ' + s.c + ')') + '">' +
          '<rect class="focus" x="' + (p[0] - 4) + '" y="' + (p[1] - 4) + '" width="' + (W + 8) + '" height="' + (H + 8) + '" rx="13"/>' +
          '<rect class="box" x="' + p[0] + '" y="' + p[1] + '" width="' + W + '" height="' + H + '" rx="10"/>' +
          '<rect x="' + p[0] + '" y="' + (p[1] + 10) + '" width="4" height="' + (H - 20) + '" rx="2" fill="' + toneColor[s.tone] + '"/>' +
          '<text x="' + (p[0] + 16) + '" y="' + (p[1] + 24) + '">' + esc(main) + '</text>' +
          '<text class="sm" x="' + (p[0] + 16) + '" y="' + (p[1] + 43) + '">' + esc(sub.length > 26 ? sub.slice(0, 25) + '…' : sub) + '</text></g>';
      }).join('') + '</svg>';
    $('#lcSvg').innerHTML = '<div class="table-wrap" style="overflow-x:auto"><div style="min-width:680px">' + svg + '</div></div>' +
      '<div class="chips mt2" role="group" aria-label="Choisir un statut">' + Object.keys(S).map(function (k) {
        return '<button type="button" class="chip" data-status-chip="' + k + '" aria-pressed="false">' + esc(client ? S[k].c + ' · ' + S[k].l : S[k].l) + '</button>';
      }).join('') + '</div>';
    $$('.lc-node').forEach(function (g) {
      var k = g.getAttribute('data-status');
      g.addEventListener('click', function () { selectStatus(k, true); });
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStatus(k, true); } });
      g.addEventListener('mouseenter', function () { if (!state.lcSel) previewStatus(k); });
      g.addEventListener('mouseleave', function () { if (!state.lcSel) previewStatus(null); });
    });
    $$('[data-status-chip]').forEach(function (b) { b.addEventListener('click', function () { selectStatus(b.getAttribute('data-status-chip'), true); }); });
    selectStatus(state.lcSel || 'en_investigation', false);
  }
  function previewStatus(k) {
    $$('.lc-node').forEach(function (g) { g.classList.remove('active', 'next', 'dim'); });
    $$('.lc-edge[data-from]').forEach(function (e) { e.classList.remove('hot'); e.setAttribute('marker-end', 'url(#arr)'); });
    if (!k) return;
    var nexts = TRANS.filter(function (t) { return t[0] === k; }).map(function (t) { return t[1]; });
    $$('.lc-node').forEach(function (g) {
      var s = g.getAttribute('data-status');
      if (s === k) g.classList.add('active'); else if (nexts.indexOf(s) >= 0) g.classList.add('next'); else g.classList.add('dim');
      g.setAttribute('aria-pressed', String(s === k));
    });
    $$('.lc-edge[data-from="' + k + '"]').forEach(function (e) { e.classList.add('hot'); e.setAttribute('marker-end', 'url(#arrHot)'); });
    renderStatusDetail(k, nexts);
  }
  function selectStatus(k, user) {
    if (!S[k]) k = 'en_investigation';
    state.lcSel = k; previewStatus(k);
    $$('[data-status-chip]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-status-chip') === k)); });
    if (user) history.replaceState(null, '', '#cycle/' + k);
  }
  function renderStatusDetail(k, nexts) {
    var s = S[k];
    var prev = TRANS.filter(function (t) { return t[1] === k; }).map(function (t) { return t[0]; });
    var toneBadge = { muted: 'neutral', info: 'info', warn: 'warn', ok: 'ok', late: 'late' }[s.tone];
    var toneIcon = { muted: 'file', info: 'info', warn: 'clock', ok: 'check', late: 'cycle' }[s.tone];
    $('#lcDetail').innerHTML = '<div class="eyebrow">Statut · <code>' + k + '</code></div><h2>' + esc(s.l) + '</h2>' +
      '<p>' + esc(s.d) + '</p>' +
      '<div class="kv"><span>Vu par le client</span><b><span class="badge ' + toneBadge + '">' + icon(toneIcon) + esc(s.c) + '</span></b></div>' +
      '<div class="kv"><span>Qui peut agir</span><b>' + s.who.map(function (w) { return esc(ROLE[w].label); }).join(', ') + '</b></div>' +
      '<div class="kv"><span>Statuts suivants</span><b>' + (nexts.length ? nexts.map(function (n) { return '<a href="#cycle/' + n + '" data-go-status="' + n + '">' + esc(S[n].l) + '</a>'; }).join(', ') : '—') + '</b></div>' +
      '<div class="kv"><span>Provient de</span><b>' + (prev.length ? prev.map(function (n) { return '<a href="#cycle/' + n + '" data-go-status="' + n + '">' + esc(S[n].l) + '</a>'; }).join(', ') : 'Création du dossier') + '</b></div>' +
      '<div class="info">' + icon('info') + '<div>' + esc(s.tip) + '</div></div>';
    $$('[data-go-status]', $('#lcDetail')).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); selectStatus(a.getAttribute('data-go-status'), true); }); });
  }

  /* ------------------------------------------------------------------------
     10. Simulateur de délais
     ------------------------------------------------------------------------ */
  var PRESETS = [
    ['2026-08-07', 'Ven. 7 août 2026 — 15 août un samedi'],
    ['2025-08-08', 'Ven. 8 août 2025 — 15 août un vendredi férié'],
    ['2026-12-23', 'Mer. 23 déc. 2026 — Noël et fin d\'année'],
    ['2026-05-23', 'Sam. 23 mai 2026 — réception le week-end + Pentecôte'],
    ['2026-01-30', 'Ven. 30 janv. 2026 — fin de mois']
  ];
  function renderSimPresets() {
    var box = $('.presets');
    box.insertAdjacentHTML('beforeend', PRESETS.map(function (p) { return '<button type="button" class="chip" data-preset="' + p[0] + '">' + esc(p[1]) + '</button>'; }).join(''));
    $$('[data-preset]').forEach(function (b) { b.addEventListener('click', function () { $('#simDate').value = b.getAttribute('data-preset'); runSim(true); }); });
    $('#simDate').addEventListener('change', function () { runSim(true); });
    $('#simDate').addEventListener('input', function () { runSim(false); });
    $('#simDetail').addEventListener('change', function () { runSim(false); });
    $('#simTime').addEventListener('change', function () { runSim(false); });
    $('#simForm').addEventListener('submit', function (e) { e.preventDefault(); runSim(true); });
  }
  function runSim(updateHash) {
    var v = $('#simDate').value, err = $('#simError'), out = $('#simOut');
    var res = TGDeadline.compute(v);
    if (res.error) {
      err.hidden = false; err.innerHTML = icon('warn') + '<span>' + esc(res.error) + '</span>'; out.innerHTML = '';
      $('#simDate').setAttribute('aria-invalid', 'true'); return;
    }
    err.hidden = true; $('#simDate').removeAttribute('aria-invalid');
    $$('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === v)); });
    if (updateHash) history.replaceState(null, '', '#delais/' + v);
    var R = TGDeadline.RULES, t = $('#simTime').value || '—';
    var html = '<div class="sim-results">' +
      '<div class="card due-card"><div class="due-label">' + icon('send', 'sm') + ' Accusé de réception</div><div class="due-date">' + cap(fmtLong.format(res.ack)) + '</div>' +
      '<div class="due-rule">à 23:59:59 (Brazzaville) · <code>' + TGDeadline.iso(res.ack) + '</code></div><p class="small mt1 mb0">' + R.ack.duration + ' jours ouvrés ; jour de départ (' + fmtDay.format(res.start) + ') non compté' + (res.shifted ? ', départ reporté au prochain jour ouvré' : '') + '. ' + res.skipped + ' jour(s) sauté(s).</p></div>' +
      '<div class="card due-card final"><div class="due-label">' + icon('flag', 'sm') + ' Réponse finale</div><div class="due-date">' + cap(fmtLong.format(res.final)) + '</div>' +
      '<div class="due-rule">à 23:59:59 (Brazzaville) · <code>' + TGDeadline.iso(res.final) + '</code></div><p class="small mt1 mb0">' + R.final.duration + ' jours calendaires après la réception.' + (res.finalNote ? ' Tombe un jour non ouvré (' + esc(res.finalNote.toLowerCase()) + ') : pas de report dans la règle de démonstration.' : '') + '</p></div>' +
      '<div class="card due-card pre"><div class="due-label">' + icon('bell', 'sm') + ' Pré-alerte interne</div><div class="due-date">' + cap(fmtLong.format(res.pre)) + '</div>' +
      '<div class="due-rule">Le dossier passe « À risque »</div><p class="small mt1 mb0">' + R.pre.duration + ' jours ouvrés avant l\'échéance finale.</p></div></div>';
    html += '<div class="card mt2"><h2>Comment le calcul a été fait</h2><ol class="mb0">' +
      '<li>Réception le <b>' + fmtLong.format(res.received) + '</b> à ' + esc(t) + ' (heure de Brazzaville, UTC+1). Le jour de réception n\'est pas compté.</li>' +
      (res.shifted ? '<li>La réception tombe un jour non ouvré : la réclamation est <b>réputée reçue le ' + fmtLong.format(res.start) + '</b> ; le décompte ouvré démarre le lendemain.</li>' : '') +
      '<li>Accusé : on compte ' + R.ack.duration + ' jours ouvrés (lundi–vendredi, hors fériés) → <b>' + fmtLong.format(res.ack) + '</b>.</li>' +
      '<li>Réponse finale : réception + ' + R.final.duration + ' jours calendaires → <b>' + fmtLong.format(res.final) + '</b>. L\'échéance n\'est pas suspendue pendant une attente d\'information.</li>' +
      (res.holidays.length ? '<li>Jour(s) férié(s) dans la fenêtre de l\'accusé : ' + res.holidays.map(function (h) { return '<b>' + fmtDay.format(h.date) + '</b> (' + esc(h.label) + (h.weekend ? ', tombe un ' + (h.date.getUTCDay() === 6 ? 'samedi' : 'dimanche') + ' : sans effet supplémentaire' : ', jour ouvré sauté') + ')'; }).join(', ') + '.</li>' : '<li>Aucun jour férié dans la fenêtre de l\'accusé.</li>') +
      '</ol>';
    if ($('#simDetail').checked) {
      html += '<h3 class="mt3">Détail jour par jour — accusé de réception</h3><ul class="cal-strip">' + res.days.map(function (d) {
        var cls = { reception: 'start', start: 'start', count: 'count', skip: 'skip', holiday: 'hol' }[d.type];
        if (d.type === 'count' && d.n === R.ack.duration) cls = 'due';
        var lab = d.type === 'reception' ? 'Réception (J)' + (d.note ? ' · ' + d.note : '') : d.type === 'start' ? 'Départ réputé' : d.type === 'count' ? 'Jour ouvré ' + d.n + (d.n === R.ack.duration ? ' · échéance' : '') : d.note;
        return '<li class="' + cls + '"><b>' + fmtShort.format(d.date) + '</b><small>' + esc(lab) + '</small></li>';
      }).join('') + '</ul>';
    }
    html += '</div>';
    out.innerHTML = html;
  }
  function renderHolidays() {
    $('#holList').innerHTML = TGDeadline.list().map(function (y) {
      return '<div><h3>' + y.year + '</h3><ul>' + y.items.map(function (h) {
        var we = TGDeadline.isWeekend(h[0]);
        return '<li class="' + (we ? 'we' : '') + '"><b>' + cap(fmtShort.format(h[0])) + '</b><span>' + esc(h[1]) + (we ? ' · week-end' : '') + '</span></li>';
      }).join('') + '</ul></div>';
    }).join('');
  }

  /* ------------------------------------------------------------------------
     11. Indicateurs : glossaire + exercice
     ------------------------------------------------------------------------ */
  function renderKpis() {
    $('#kpiGlossary').innerHTML = KPIS.map(function (k) {
      return '<article class="card kpi-def" id="kpi-' + k.k + '"><div class="k-head"><h3 class="mb0">' + esc(k.l) + '</h3><code class="key">' + k.k + '</code></div>' +
        '<p class="mb0">' + esc(k.d) + '</p><div class="formula"><span class="sr-only">Formule : </span>' + esc(k.f) + '</div>' +
        '<p class="ex mb0"><span class="badge neutral">' + icon('info') + 'Exemple fictif</span> ' + k.ex + '</p><p class="small muted mb0">' + esc(k.note) + '</p></article>';
    }).join('');
  }
  var EX = [
    ['A', '2026-08-12', '2026-08-28'], ['B', '2026-08-20', '2026-09-03'], ['C', '2026-08-25', null], ['D', '2026-09-02', '2026-09-15'],
    ['E', '2026-09-10', '2026-10-05'], ['F', '2026-09-28', null], ['G', '2026-09-18', '2026-09-18']
  ];
  function renderExercise() {
    var box = $('#exercise');
    box.innerHTML = '<p>Sept dossiers fictifs franchissent la fin août. Changez la période et la date de calcul : observez quels dossiers comptent dans chaque indicateur.</p>' +
      '<div class="ex-controls"><label class="field">Période<select id="exPeriod"><option value="2026-08">Août 2026 (01/08 → 31/08)</option><option value="2026-09" selected>Septembre 2026 (01/09 → 30/09)</option></select></label>' +
      '<label class="field">Date de calcul (as_of)<select id="exAsOf"><option value="end" selected>Fin de période</option><option value="2026-10-15">15 octobre 2026</option></select></label></div>' +
      '<div class="ex-metrics" id="exMetrics" aria-live="polite"></div>' +
      '<div class="gantt" id="exGantt" role="img"></div>' +
      '<div class="legend-row"><span><span class="gantt-pt in" style="position:static;display:inline-block;margin:0"></span> Réception</span><span><span class="gantt-pt out" style="position:static;display:inline-block;margin:0"></span> Réponse finale</span><span>Zone bleue : période</span><span>Trait rouge pointillé : date de calcul</span></div>' +
      '<div class="table-wrap mt2"><table class="table ex-table stack-sm"><caption>Qui compte où ?</caption><thead><tr><th scope="col">Dossier</th><th scope="col">Réception</th><th scope="col">Réponse finale</th><th scope="col">Reçue</th><th scope="col">Réponse</th><th scope="col">Cohorte traitée</th><th scope="col">Stock de fin</th></tr></thead><tbody id="exRows"></tbody></table></div>' +
      '<div id="exExplain"></div>';
    $('#exPeriod').addEventListener('change', calcExercise);
    $('#exAsOf').addEventListener('change', calcExercise);
    calcExercise();
  }
  function calcExercise() {
    var per = $('#exPeriod').value;
    var from = per + '-01', to = per === '2026-08' ? '2026-08-31' : '2026-09-30';
    var asOf = $('#exAsOf').value === 'end' ? to : $('#exAsOf').value;
    var prevEnd = per === '2026-08' ? '2026-07-31' : '2026-08-31';
    function inP(d) { return d && d >= from && d <= to; }
    function openAt(x, D) { return x[1] <= D && (!x[2] || x[2] > D); }
    var rows = EX.map(function (x) {
      return { x: x, rec: inP(x[1]), resp: inP(x[2]), coh: inP(x[1]) && x[2] && x[2] <= asOf, stock: openAt(x, to), stock0: openAt(x, prevEnd) };
    });
    var c = function (f) { return rows.filter(function (r) { return r[f]; }).length; };
    var rec = c('rec'), resp = c('resp'), coh = c('coh'), st = c('stock'), st0 = c('stock0');
    var rate = rec ? (Math.round(coh / rec * 1000) / 10).toString().replace('.', ',') + ' %' : '—';
    var fmt = function (k) { return fmtNum.format(TGDeadline.fromKey(k)); };
    $('#exMetrics').innerHTML = [[rec, 'Reçues sur la période'], [resp, 'Réponses sur la période'], [coh + ' / ' + rec, 'Cohorte traitée au ' + fmt(asOf) + ' (' + rate + ')'], [st, 'Stock au ' + fmt(to)]].map(function (m) {
      return '<div class="card"><b>' + m[0] + '</b><span>' + esc(m[1]) + '</span></div>';
    }).join('');
    /* Gantt : axe 01/08 → 31/10 (92 jours) */
    var t0 = Date.UTC(2026, 7, 1), span = 92 * 86400000;
    var posOf = function (k) { return Math.max(0, Math.min(100, (TGDeadline.fromKey(k).getTime() - t0) / span * 100)); };
    var win = [posOf(from), posOf(to) + 100 / 92];
    var g = '<div class="gantt-axis"><span></span><div class="months"><span>Août</span><span>Sept.</span><span>Oct.</span></div></div>' + rows.map(function (r) {
      var x = r.x, a = posOf(x[1]), b = x[2] ? posOf(x[2]) : 100;
      return '<div class="gantt-row"><span class="g-label">Dossier ' + x[0] + '</span><div class="gantt-track"><div class="gantt-window" style="left:' + win[0] + '%;width:' + (win[1] - win[0]) + '%"></div>' +
        '<div class="gantt-asof" style="left:' + posOf(asOf) + '%"></div>' +
        '<div class="gantt-bar' + (x[2] ? '' : ' open') + '" style="left:' + a + '%;width:' + Math.max(b - a, 0.8) + '%"></div>' +
        '<span class="gantt-pt in" style="left:' + a + '%"></span>' + (x[2] ? '<span class="gantt-pt out" style="left:' + b + '%"></span>' : '') + '</div></div>';
    }).join('');
    var ga = $('#exGantt'); ga.innerHTML = g;
    ga.setAttribute('aria-label', 'Frise des 7 dossiers entre août et octobre 2026. ' + rows.map(function (r) { return 'Dossier ' + r.x[0] + ' reçu le ' + fmt(r.x[1]) + (r.x[2] ? ', répondu le ' + fmt(r.x[2]) : ', toujours ouvert'); }).join('. ') + '.');
    var yes = function (b) { return b ? '<td class="yes" data-label="">' + icon('check', 'sm') + ' Oui</td>' : '<td class="no">Non</td>'; };
    $('#exRows').innerHTML = rows.map(function (r) {
      return '<tr><td data-label="Dossier"><b>' + r.x[0] + '</b></td><td data-label="Réception">' + fmt(r.x[1]) + '</td><td data-label="Réponse finale">' + (r.x[2] ? fmt(r.x[2]) : '<span class="badge warn">' + icon('clock') + 'Ouvert</span>') + '</td>' +
        yes(r.rec).replace('data-label=""', 'data-label="Reçue"').replace('<td class="no">', '<td class="no" data-label="Reçue">') +
        yes(r.resp).replace('data-label=""', 'data-label="Réponse"').replace('<td class="no">', '<td class="no" data-label="Réponse">') +
        yes(r.coh).replace('data-label=""', 'data-label="Cohorte traitée"').replace('<td class="no">', '<td class="no" data-label="Cohorte traitée">') +
        yes(r.stock).replace('data-label=""', 'data-label="Stock de fin"').replace('<td class="no">', '<td class="no" data-label="Stock de fin">') + '</tr>';
    }).join('');
    var balanced = st0 + rec - resp === st;
    var crossers = rows.filter(function (r) { return r.resp && !r.rec; }).map(function (r) { return r.x[0]; });
    var late = rows.filter(function (r) { return r.rec && !r.resp; }).map(function (r) { return r.x[0]; });
    $('#exExplain').innerHTML = '<div class="info">' + icon('info') + '<div><p><b>Pourquoi les nombres diffèrent :</b> ' +
      (crossers.length ? 'le(s) dossier(s) <b>' + crossers.join(', ') + '</b> compte(nt) dans les réponses de la période mais a (ont) été reçu(s) avant. ' : '') +
      (late.length ? 'Le(s) dossier(s) <b>' + late.join(', ') + '</b> reçu(s) dans la période n\'a (n\'ont) pas de réponse dans la période. ' : '') +
      'Reçues et réponses mesurent deux flux distincts : aucun des deux n\'est « faux ».</p>' +
      '<p class="mb0"><b>Réconciliation :</b> stock au ' + fmt(prevEnd) + ' (' + st0 + ') + entrées (' + rec + ') − réponses (' + resp + ') = ' + (st0 + rec - resp) + ' → stock au ' + fmt(to) + ' : ' + st + ' ' +
      (balanced ? '<span class="badge ok">' + icon('check') + 'Équilibré</span>' : '<span class="badge late">' + icon('warn') + 'Écart</span>') + '</p></div></div>' +
      ($('#exAsOf').value !== 'end' ? '<p class="small muted">Avec une date de calcul au 15/10/2026, la cohorte traitée augmente (le dossier E a reçu sa réponse le 05/10) alors que les reçues et les réponses de la période ne changent pas : c\'est pourquoi la date de calcul est toujours affichée.</p>' : '');
  }

  /* ------------------------------------------------------------------------
     12. Rôles et droits
     ------------------------------------------------------------------------ */
  function renderRoles() {
    $('#roleSelect').innerHTML = '<option value="">Tous les profils</option>' + ROLES.map(function (r) { return '<option value="' + r.id + '">' + esc(r.long) + '</option>'; }).join('');
    $('#domainSelect').innerHTML = '<option value="">Tous les domaines</option>' + DOMAINS.map(function (d) { return '<option>' + d + '</option>'; }).join('');
    if (state.profile) $('#roleSelect').value = state.profile;
    ['#permSearch', '#roleSelect', '#domainSelect'].forEach(function (s) { $(s).addEventListener('input', drawMatrix); $(s).addEventListener('change', drawMatrix); });
    $('#scopes').innerHTML = ROLES.map(function (r) {
      return '<div class="card" id="role-' + r.id + '"><div class="row"><span class="q-ic" style="width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:var(--info-bg);color:var(--blue)">' + icon(r.icon) + '</span><div><h3 class="mb0">' + esc(r.long) + '</h3><code class="small muted">' + r.id + '</code></div></div><p class="mt1 mb0">' + esc(r.scope) + '</p></div>';
    }).join('');
    drawMatrix();
  }
  function drawMatrix() {
    var q = norm($('#permSearch').value.trim()), role = $('#roleSelect').value, dom = $('#domainSelect').value;
    var ri = role ? ROLES.findIndex(function (r) { return r.id === role; }) : -1;
    var rows = PERMS.filter(function (p) { return (!dom || p[0] === dom) && (!q || norm(p[1] + ' ' + p[2] + ' ' + p[0] + ' ' + Object.values(p[4]).join(' ')).indexOf(q) >= 0); });
    var head = '<caption class="sr-only">Droits par profil</caption><thead><tr><th scope="col">Droit</th>' + ROLES.map(function (r, i) {
      return '<th scope="col" class="role-col' + (i === ri ? ' col-hl' : '') + '">' + esc(r.label) + '</th>';
    }).join('') + '</tr></thead>';
    var body = '', lastDom = '';
    rows.forEach(function (p) {
      if (p[0] !== lastDom) { body += '<tr class="domain"><td colspan="' + (ROLES.length + 1) + '">' + p[0] + '</td></tr>'; lastDom = p[0]; }
      var vals = p[3].split(' ');
      body += '<tr><th scope="row" class="perm" style="text-align:left;text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink);background:var(--surface);font-weight:700">' + esc(p[1]) + '<small><code>' + esc(p[2]) + '</code></small></th>' + vals.map(function (v, i) {
        var note = p[4][i];
        var cell = v === 'y' ? '<span class="yes" title="Oui' + (note ? ' — ' + esc(note) : '') + '">' + icon('check') + '</span><span class="sr-only">Oui' + (note ? ' : ' + esc(note) : '') + '</span>'
          : v === 'p' ? '<span class="part" title="Partiel — ' + esc(note || '') + '">' + icon('half') + '</span><span class="sr-only">Partiel : ' + esc(note || '') + '</span>'
            : '<span class="no" title="Non' + (note ? ' — ' + esc(note) : '') + '">' + icon('minus') + '</span><span class="sr-only">Non' + (note ? ' : ' + esc(note) : '') + '</span>';
        var vis = note && (i === ri || ri < 0 && v === 'p') ? '<small class="muted" style="display:block;font-size:11.5px;line-height:1.3;margin-top:2px" aria-hidden="true">' + esc(note) + '</small>' : '';
        return '<td class="cell' + (i === ri ? ' col-hl' : '') + '">' + cell + vis + '</td>';
      }).join('') + '</tr>';
    });
    if (!rows.length) body = '<tr><td colspan="' + (ROLES.length + 1) + '"><div class="empty-state">' + icon('search') + '<p class="mb0">Aucun droit ne correspond à « ' + esc($('#permSearch').value) + ' ». Essayez « export », « valider » ou « pièces ».</p></div></td></tr>';
    $('#matrix').innerHTML = head + '<tbody>' + body + '</tbody>';
    var cnt = ri >= 0 ? rows.filter(function (p) { return p[3].split(' ')[ri] !== 'n'; }).length : null;
    $('#permCount').textContent = rows.length + ' droit(s) affiché(s)' + (cnt !== null ? ' · ' + cnt + ' accordé(s) au profil « ' + ROLES[ri].label + ' »' : '');
  }

  /* ------------------------------------------------------------------------
     13. FAQ, installation
     ------------------------------------------------------------------------ */
  function acc(list, prefix) {
    return list.map(function (f) { return '<details class="acc" id="' + prefix + f.id + '"><summary>' + esc(f.q) + '</summary><div class="acc-body">' + f.a + '</div></details>'; }).join('');
  }
  function renderFaq() {
    $('#faqList').innerHTML = acc(FAQ, 'faq-') + '<div class="empty-state" id="faqEmpty" hidden>' + icon('help') + '<p>Aucune question ne correspond. Essayez la <a href="#" id="faqToSearch">recherche globale</a>.</p></div>';
    $('#installFaq').innerHTML = acc(INSTALL_FAQ, 'inst-');
    $('#faqSearch').addEventListener('input', filterFaq);
    $('#faqToSearch').addEventListener('click', function (e) { e.preventDefault(); $('#q').value = $('#faqSearch').value; $('#q').focus(); doSearch(); });
    filterFaq();
  }
  function filterFaq() {
    var q = norm($('#faqSearch').value.trim()).split(/\s+/).filter(Boolean), n = 0;
    $$('#faqList details').forEach(function (d) {
      var ok = q.every(function (t) { return norm(d.textContent).indexOf(t) >= 0; });
      d.hidden = !ok; if (ok) n++;
    });
    $('#faqEmpty').hidden = n > 0;
    $('#faqCount').textContent = n + ' question(s)';
  }
  function renderAccounts() {
    $('#accounts tbody').innerHTML = ACCOUNTS.map(function (a, i) {
      return '<tr><td data-label="Adresse"><code id="acc' + i + '">' + a[0] + '</code></td><td data-label="Rôle"><span class="badge info">' + icon(ROLE[a[1]].icon) + esc(ROLE[a[1]].label) + '</span></td><td data-label="Périmètre">' + esc(a[2]) + '</td>' +
        '<td data-label="Copier"><button class="copy-btn inline" type="button" data-copy="#acc' + i + '" aria-label="Copier l\'adresse ' + a[0] + '">' + icon('copy', 'sm') + '</button></td></tr>';
    }).join('');
  }
  function wireCopy() {
    $$('.code').forEach(function (c, i) {
      if ($('.copy-btn', c)) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'copy-btn'; b.setAttribute('aria-label', 'Copier les commandes');
      b.innerHTML = icon('copy', 'sm'); b.setAttribute('data-copy-code', i); c.appendChild(b);
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy],[data-copy-code]'); if (!b) return;
      if (b.hasAttribute('data-copy')) { var el = $(b.getAttribute('data-copy')); copyText(el.textContent.trim(), b.getAttribute('data-copy') === '#demoPwd' ? 'Mot de passe' : 'Adresse'); }
      else {
        var code = $('code', b.parentElement).textContent.split('\n').filter(function (l) { return l.trim() && l.trim().charAt(0) !== '#'; }).join('\n');
        copyText(code, 'Commande');
      }
    });
  }

  /* ------------------------------------------------------------------------
     14. Recherche plein texte
     ------------------------------------------------------------------------ */
  var INDEX = [];
  var ROUTE_TITLES = { accueil: 'Accueil', parcours: 'Parcours pas à pas', ecrans: 'Écrans commentés', cycle: 'Cycle de vie', delais: 'Simulateur de délais', indicateurs: 'Indicateurs', roles: 'Rôles et droits', installation: 'Installation technique', faq: 'Questions fréquentes' };
  function buildIndex() {
    INDEX = [];
    function add(route, section, title, text) { text = text.replace(/\s+/g, ' ').trim(); if (text.length > 2) INDEX.push({ r: route, s: section, t: title, x: text, n: norm(title + ' ' + text), nt: norm(title) }); }
    /* Pages statiques */
    ['accueil', 'cycle', 'delais', 'indicateurs', 'roles', 'installation'].forEach(function (r) {
      var page = $('#page-' + r); var h = ROUTE_TITLES[r];
      $$('h2, h3, p, li, .kv, .req .card', page).forEach(function (el) {
        if (el.closest('.lc-wrap, #exercise, #matrix, #simOut, .profiles, #recoZone, #quickLinks, .hol-years')) return;
        var head = el.closest('.card, section'); var ht = head && $('h2, h3', head); add(r, h, ht ? ht.textContent : h, el.textContent);
      });
    });
    J.forEach(function (j) {
      add('parcours/' + j.id, 'Parcours', j.title, j.summary);
      j.steps.forEach(function (s, i) { add('parcours/' + j.id + '/' + (i + 1), 'Parcours · ' + j.title, s.t, strip(s.b)); });
    });
    SCREEN_ORDER.forEach(function (k) { SCREENS[k].hs.forEach(function (h, i) { add('ecrans/' + k + '/' + (i + 1), 'Écran · ' + SCREENS[k].l, h[0], h[1]); }); });
    Object.keys(S).forEach(function (k) { add('cycle/' + k, 'Cycle de vie', 'Statut « ' + S[k].l + ' »', S[k].d + ' Vu par le client : ' + S[k].c + '. ' + S[k].tip); });
    KPIS.forEach(function (k) { add('indicateurs/' + k.k, 'Indicateurs', k.l, k.d + ' ' + k.f + ' ' + strip(k.ex) + ' ' + k.note); });
    PERMS.forEach(function (p) { add('roles', 'Rôles et droits', p[1], p[0] + ' · ' + p[2] + ' · ' + Object.values(p[4]).join(' · ')); });
    ROLES.forEach(function (r) { add('roles/' + r.id, 'Rôles et droits', r.long, r.desc + ' ' + r.scope); });
    FAQ.forEach(function (f) { add('faq/' + f.id, 'FAQ', f.q, strip(f.a)); });
    INSTALL_FAQ.forEach(function (f) { add('installation', 'Installation · dépannage', f.q, strip(f.a)); });
  }
  var searchSel = -1;
  function doSearch() {
    var raw = $('#q').value.trim(), box = $('#qResults');
    var terms = norm(raw).split(/\s+/).filter(function (t) { return t.length > 1; });
    if (!terms.length) { closeSearch(); return; }
    var res = INDEX.filter(function (e) { return terms.every(function (t) { return e.n.indexOf(t) >= 0; }); })
      .map(function (e) { var sc = 0; terms.forEach(function (t) { if (e.nt.indexOf(t) >= 0) sc += 3; if (e.n.indexOf(t) >= 0) sc += 1; }); return { e: e, sc: sc }; })
      .sort(function (a, b) { return b.sc - a.sc; });
    var seen = {}; res = res.filter(function (r) { var k = r.e.r + '|' + r.e.t; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 12);
    searchSel = -1;
    box.innerHTML = res.length ? res.map(function (r, i) {
      return '<a class="res" role="option" id="res' + i + '" aria-selected="false" href="#' + r.e.r + '"><small>' + esc(r.e.s) + '</small><span><b>' + hl(r.e.t, terms) + '</b></span><span class="muted">' + hl(snippet(r.e.x, terms), terms) + '</span></a>';
    }).join('') : '<div class="none" role="option" aria-disabled="true">Aucun résultat pour « ' + esc(raw) + ' ». Essayez « délai », « doublon », « export ».</div>';
    box.hidden = false; $('#q').setAttribute('aria-expanded', 'true');
    $('#q').removeAttribute('aria-activedescendant');
    $$('.res', box).forEach(function (a) { a.addEventListener('click', function () { closeSearch(); }); });
  }
  function snippet(text, terms) {
    var n = norm(text), i = n.indexOf(terms[0]); if (i < 0) i = 0;
    var s = Math.max(0, i - 50), e = Math.min(text.length, i + 110);
    return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
  }
  function hl(text, terms) {
    var n = norm(text), marks = [];
    terms.forEach(function (t) { var i = n.indexOf(t); while (i >= 0) { marks.push([i, i + t.length]); i = n.indexOf(t, i + t.length); } });
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var out = '', pos = 0;
    marks.forEach(function (m) { if (m[0] < pos) return; out += esc(text.slice(pos, m[0])) + '<mark>' + esc(text.slice(m[0], m[1])) + '</mark>'; pos = m[1]; });
    return out + esc(text.slice(pos));
  }
  function closeSearch() { var box = $('#qResults'); box.hidden = true; $('#q').setAttribute('aria-expanded', 'false'); $('#q').removeAttribute('aria-activedescendant'); }
  function wireSearch() {
    var q = $('#q');
    q.addEventListener('input', doSearch);
    q.addEventListener('focus', function () { if (q.value.trim()) doSearch(); });
    q.addEventListener('keydown', function (e) {
      var items = $$('#qResults .res');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return; e.preventDefault();
        searchSel = (searchSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (it, i) { it.setAttribute('aria-selected', String(i === searchSel)); });
        q.setAttribute('aria-activedescendant', items[searchSel].id); items[searchSel].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        var target = items[searchSel >= 0 ? searchSel : 0]; if (target) { e.preventDefault(); location.hash = target.getAttribute('href').slice(1); closeSearch(); q.blur(); }
      } else if (e.key === 'Escape') { if (!$('#qResults').hidden) { closeSearch(); } else { q.value = ''; q.blur(); } }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search')) closeSearch(); });
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !e.target.isContentEditable) {
        e.preventDefault(); q.focus(); q.select();
      }
    });
  }

  /* ------------------------------------------------------------------------
     15. Routeur (hash)
     ------------------------------------------------------------------------ */
  function currentRoute() { return decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'accueil'; }
  function crumbs(parts) {
    $('#crumbs').innerHTML = parts.map(function (p, i) {
      var last = i === parts.length - 1;
      return '<li>' + (last ? '<span aria-current="page">' + esc(p[0]) + '</span>' : '<a href="#' + p[1] + '">' + esc(p[0]) + '</a>') + '</li>';
    }).join('');
  }
  function showPage(id) {
    $$('.page').forEach(function (p) { p.hidden = p.id !== 'page-' + id; });
  }
  function route() {
    var r = currentRoute(), parts = r.split('/'), base = parts[0], title = '', focusEl = null, prevBase = state.lastBase;
    var home = ['Guide', 'accueil'];
    closeMenu();
    switch (base) {
      case 'accueil':
        showPage('accueil'); crumbs([['Guide', 'accueil'], ['Accueil']]); title = 'Accueil';
        if (parts[1] === 'profil') setTimeout(function () { $('#profil').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); var b = $('.profile-card'); if (b) b.focus({ preventScroll: true }); }, 30);
        else focusEl = $('#h-accueil');
        break;
      case 'parcours':
        if (parts[1]) {
          showPage('parcours-detail'); renderJourney(parts[1], parts[2]);
          var j = JMAP[parts[1]]; title = j ? j.title : 'Parcours';
          crumbs([home, ['Parcours', 'parcours'], [j ? j.title : 'Introuvable']]);
          focusEl = (prevBase === r.split('/').slice(0, 2).join('/')) ? $('.step-panel:not([hidden]) h2') : $('#h-journey');
          state.lastBase = parts.slice(0, 2).join('/');
          document.title = title + ' · Guide TSITA GEST';
          markNav(r); finishRoute(focusEl); return;
        }
        showPage('parcours'); renderJourneyList(); crumbs([home, ['Parcours pas à pas']]); title = 'Parcours pas à pas'; focusEl = $('#h-parcours');
        break;
      case 'ecrans':
        showPage('ecrans'); renderScreen(parts[1] || state.screen, parts[2]);
        crumbs([home, ['Écrans commentés', 'ecrans'], [SCREENS[state.screen].l]]); title = 'Écran : ' + SCREENS[state.screen].l;
        focusEl = prevBase === 'ecrans' ? null : $('#h-ecrans');
        break;
      case 'cycle':
        showPage('cycle'); if (parts[1] && S[parts[1]]) { state.lcSel = parts[1]; }
        renderLifecycle(); crumbs([home, ['Cycle de vie d\'un dossier']]); title = 'Cycle de vie d\'un dossier'; focusEl = prevBase === 'cycle' ? null : $('#h-cycle');
        break;
      case 'delais':
        showPage('delais');
        if (parts[1] && TGDeadline.fromKey(parts[1])) $('#simDate').value = parts[1];
        runSim(false); crumbs([home, ['Simulateur de délais']]); title = 'Simulateur de délais'; focusEl = prevBase === 'delais' ? null : $('#h-delais');
        break;
      case 'indicateurs':
        showPage('indicateurs'); crumbs([home, ['Indicateurs']]); title = 'Indicateurs';
        if (parts[1]) { var el = $('#kpi-' + parts[1]); if (el) { focusEl = null; setTimeout(function () { el.scrollIntoView({ block: 'center' }); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }, 30); } }
        else focusEl = $('#h-kpi');
        break;
      case 'roles':
        showPage('roles'); crumbs([home, ['Rôles et droits']]); title = 'Rôles et droits';
        if (parts[1] && ROLE[parts[1]]) { $('#roleSelect').value = parts[1]; drawMatrix(); var rc = $('#role-' + parts[1]); setTimeout(function () { rc.scrollIntoView({ block: 'center' }); rc.setAttribute('tabindex', '-1'); rc.focus({ preventScroll: true }); }, 30); }
        else focusEl = $('#h-roles');
        break;
      case 'installation':
        showPage('installation'); crumbs([home, ['Installation technique']]); title = 'Installation technique'; focusEl = $('#h-install');
        break;
      case 'faq':
        showPage('faq'); crumbs([home, ['Questions fréquentes']]); title = 'Questions fréquentes';
        if (parts[1]) { var d = $('#faq-' + parts[1]); if (d) { $('#faqSearch').value = ''; filterFaq(); d.open = true; setTimeout(function () { d.scrollIntoView({ block: 'center' }); $('summary', d).focus({ preventScroll: true }); }, 30); } }
        else focusEl = $('#h-faq');
        break;
      default:
        location.replace('#accueil'); return;
    }
    state.lastBase = base;
    document.title = title + ' · Guide TSITA GEST';
    markNav(r);
    finishRoute(focusEl);
  }
  function finishRoute(focusEl) {
    if (state.firstRoute) { state.firstRoute = false; return; }
    if (focusEl) {
      if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1');
      focusEl.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  /* ------------------------------------------------------------------------
     16. Thème, menu mobile, impression
     ------------------------------------------------------------------------ */
  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function syncThemeBtn() {
    var d = isDark(), b = $('#themeBtn');
    b.setAttribute('aria-pressed', String(d)); b.setAttribute('aria-label', d ? 'Revenir au mode clair' : 'Activer le mode sombre');
    b.innerHTML = icon(d ? 'sun' : 'moon');
  }
  function wireTheme() {
    syncThemeBtn();
    $('#themeBtn').addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('tg-guide-theme', next); } catch (e) { /* ignore */ }
      syncThemeBtn();
    });
    if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', syncThemeBtn); }
  }
  function openMenu() {
    var s = $('#sidebar'); s.classList.add('open'); $('#scrim').hidden = false; $('#menuBtn').setAttribute('aria-expanded', 'true');
    $('#menuBtn').setAttribute('aria-label', 'Fermer le menu');
    var first = $('a', s); if (first) first.focus();
  }
  function closeMenu() {
    var s = $('#sidebar'); if (!s.classList.contains('open')) return;
    s.classList.remove('open'); $('#scrim').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); $('#menuBtn').setAttribute('aria-label', 'Ouvrir le menu');
  }
  function wireMenu() {
    $('#menuBtn').addEventListener('click', function () { if ($('#sidebar').classList.contains('open')) { closeMenu(); $('#menuBtn').focus(); } else openMenu(); });
    $('#scrim').addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#sidebar').classList.contains('open')) { closeMenu(); $('#menuBtn').focus(); }
      /* piège de focus dans le tiroir mobile */
      if (e.key === 'Tab' && $('#sidebar').classList.contains('open')) {
        var f = $$('#sidebar a, #sidebar button'); var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); $('#menuBtn').focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); $('#menuBtn').focus(); }
      }
    });
    $('#printBtn').addEventListener('click', function () { window.print(); });
  }

  /* ------------------------------------------------------------------------
     17. Démarrage
     ------------------------------------------------------------------------ */
  function init() {
    renderNav(); renderProfiles(); renderQuick(); renderJourneyList();
    renderScreenTabs(); renderKpis(); renderExercise(); renderRoles(); renderFaq(); renderAccounts();
    renderHolidays(); renderSimPresets();
    var today = todayBrazzaville();
    $('#simDate').value = TGDeadline.compute(today).error ? '2026-08-07' : today;
    wireCopy(); wireSearch(); wireTheme(); wireMenu();

    $('#profiles').addEventListener('click', function (e) {
      var b = e.target.closest('[data-profile]'); if (!b) return;
      var id = b.getAttribute('data-profile'); setProfile(state.profile === id ? null : id);
      var nb = $('[data-profile="' + id + '"]'); if (nb) nb.focus();
    });
    $('#journeyFilter').addEventListener('click', function (e) {
      var b = e.target.closest('[data-jf]'); if (!b) return; state.journeyFilter = b.getAttribute('data-jf'); renderJourneyList();
      var nb = $('[data-jf="' + state.journeyFilter + '"]'); if (nb) nb.focus();
    });
    $('#resetProgress').addEventListener('click', function () {
      if (!window.confirm('Effacer la progression de tous les parcours sur cet appareil ?')) return;
      state.progress = {}; saveProgress(); renderJourneyList(); renderReco(); toast('Progression réinitialisée.');
    });
    $('#screenTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-screen]'); if (b) location.hash = 'ecrans/' + b.getAttribute('data-screen'); });
    $('#screenTabs').addEventListener('keydown', function (e) {
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].indexOf(e.key) < 0) return;
      e.preventDefault(); var i = SCREEN_ORDER.indexOf(state.screen);
      i = e.key === 'Home' ? 0 : e.key === 'End' ? SCREEN_ORDER.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + SCREEN_ORDER.length) % SCREEN_ORDER.length;
      location.hash = 'ecrans/' + SCREEN_ORDER[i]; setTimeout(function () { $('#tab-' + SCREEN_ORDER[i]).focus(); }, 0);
    });
    $('#lcInternal').addEventListener('click', function () { state.lcView = 'internal'; $('#lcInternal').setAttribute('aria-pressed', 'true'); $('#lcClient').setAttribute('aria-pressed', 'false'); renderLifecycle(); });
    $('#lcClient').addEventListener('click', function () { state.lcView = 'client'; $('#lcClient').setAttribute('aria-pressed', 'true'); $('#lcInternal').setAttribute('aria-pressed', 'false'); renderLifecycle(); });

    window.addEventListener('hashchange', route);
    route();
    renderLifecycle(); /* pour l'index de recherche et un rendu prêt */
    buildIndex();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
