# -*- coding: utf-8 -*-
"""Génère le contrat de prestation (PDF signable, champs remplissables).

Usage : python3 docs/contrat/generate_contract.py
Sortie : docs/contrat/Contrat_Plateforme_Livraison_Ouagadougou.pdf
"""
import os

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (ArrayObject, DictionaryObject, FloatObject,
                           NameObject, NumberObject, TextStringObject)
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Flowable, KeepTogether, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, "_tmp_contract.pdf")
OUT = os.path.join(HERE, "Contrat_Plateforme_Livraison_Ouagadougou.pdf")

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
CONTENT_W = PAGE_W - 2 * MARGIN
ACCENT = colors.HexColor("#0B5D3B")
FIELD_BG = colors.HexColor("#EEF4FF")
FIELD_BORDER = colors.HexColor("#8AA4D6")

# Signature fields recorded during build: (page_index, name, x, y, w, h)
SIG_FIELDS = []
_field_counter = {"n": 0}

ss = getSampleStyleSheet()
BODY = ParagraphStyle("body", parent=ss["Normal"], fontName="Helvetica",
                      fontSize=9.6, leading=13.2, alignment=TA_JUSTIFY,
                      spaceAfter=4)
BULLET = ParagraphStyle("bullet", parent=BODY, leftIndent=12,
                        bulletIndent=2, spaceAfter=2)
H1 = ParagraphStyle("h1", parent=BODY, fontName="Helvetica-Bold",
                    fontSize=15, leading=19, alignment=TA_CENTER,
                    textColor=ACCENT, spaceAfter=4)
SUB = ParagraphStyle("sub", parent=BODY, alignment=TA_CENTER, fontSize=10,
                     textColor=colors.HexColor("#333333"))
H2 = ParagraphStyle("h2", parent=BODY, fontName="Helvetica-Bold",
                    fontSize=11, leading=15, textColor=ACCENT,
                    spaceBefore=8, spaceAfter=3, alignment=0)
H3 = ParagraphStyle("h3", parent=BODY, fontName="Helvetica-Bold",
                    fontSize=10, leading=13, spaceBefore=4, spaceAfter=2,
                    alignment=0)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=8, leading=10.5,
                       textColor=colors.HexColor("#555555"))
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.6, leading=11,
                      alignment=0, spaceAfter=0)
CELLB = ParagraphStyle("cellb", parent=CELL, fontName="Helvetica-Bold")


def uid(prefix):
    _field_counter["n"] += 1
    return "%s_%d" % (prefix, _field_counter["n"])


class Field(Flowable):
    """Label + fillable text field on one line."""

    def __init__(self, label, name, width=CONTENT_W, label_w=48 * mm,
                 height=15, multiline=False, lines=1, tooltip=None):
        super().__init__()
        self.label, self.name = label, name
        self.width, self.label_w = width, label_w
        self.fh = height if lines == 1 else 12 * lines + 4
        self.height = self.fh + 4
        self.multiline = multiline or lines > 1
        self.tooltip = tooltip or label

    def draw(self):
        c = self.canv
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.black)
        if self.label:
            c.drawString(0, self.height - 12, self.label)
        fw = self.width - self.label_w
        c.acroForm.textfield(
            name=self.name, tooltip=self.tooltip, x=self.label_w, y=2,
            width=fw, height=self.fh, relative=True, fontName="Helvetica",
            fontSize=9 if not self.multiline else 8.5,
            borderColor=FIELD_BORDER, fillColor=FIELD_BG,
            textColor=colors.black, borderWidth=0.6,
            fieldFlags="multiline" if self.multiline else "")


class Check(Flowable):
    """Checkbox + paragraph text."""

    def __init__(self, name, text, width=CONTENT_W):
        super().__init__()
        self.name = name
        self.para = Paragraph(text, BODY)
        self.width = width

    def wrap(self, aw, ah):
        _, h = self.para.wrap(self.width - 18, ah)
        self.height = max(h, 14) + 2
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.acroForm.checkbox(name=self.name, tooltip=self.name, x=0,
                            y=self.height - 13, size=11, relative=True,
                            buttonStyle="cross", borderColor=FIELD_BORDER,
                            fillColor=FIELD_BG, borderWidth=0.8)
        self.para.drawOn(c, 18, self.height - self.para.height - 2)


class SignatureBox(Flowable):
    """Party signature block: name, title, date, 'lu et approuvé',
    digital signature field (recorded for post-processing) and stamp area."""

    def __init__(self, party, key, width):
        super().__init__()
        self.party, self.key = party, key
        self.width = width
        self.height = 230

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        c.setStrokeColor(ACCENT)
        c.setLineWidth(1)
        c.roundRect(0, 0, w, h, 6)
        c.setFillColor(ACCENT)
        c.setFont("Helvetica-Bold", 10.5)
        c.drawString(8, h - 16, self.party)
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 8.5)
        rows = [("Nom et prénom(s)", "nom"), ("Qualité / Fonction", "qualite"),
                ("Date", "date")]
        y = h - 40
        for label, suffix in rows:
            c.drawString(8, y + 4, label)
            c.acroForm.textfield(
                name="sig_%s_%s" % (self.key, suffix), tooltip=label,
                x=88, y=y, width=w - 96, height=14, relative=True,
                fontName="Helvetica", fontSize=9, borderColor=FIELD_BORDER,
                fillColor=FIELD_BG, borderWidth=0.6)
            y -= 20
        c.drawString(8, y + 2,
                     "Mention manuscrite « Lu et approuvé, bon pour accord » :")
        y -= 18
        c.acroForm.textfield(
            name="sig_%s_mention" % self.key, tooltip="Lu et approuvé",
            x=8, y=y, width=w - 16, height=14, relative=True,
            fontName="Helvetica-Oblique", fontSize=9,
            borderColor=FIELD_BORDER, fillColor=FIELD_BG, borderWidth=0.6)
        y -= 14
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(8, y, "Signature")
        c.drawString(w / 2 + 4, y, "Cachet (le cas échéant)")
        box_h = y - 12
        # signature area (digital signature field added later + ink area)
        c.setDash(2, 2)
        c.setStrokeColor(colors.grey)
        c.rect(8, 8, w / 2 - 14, box_h - 4)
        c.rect(w / 2 + 4, 8, w / 2 - 12, box_h - 4)
        c.setDash()
        ax, ay = c.absolutePosition(8, 8)
        SIG_FIELDS.append((c.getPageNumber() - 1, "signature_%s" % self.key,
                           ax, ay, w / 2 - 14, box_h - 4))


def on_page(c, doc):
    c.saveState()
    n = c.getPageNumber()
    c.setStrokeColor(ACCENT)
    c.setLineWidth(0.6)
    c.line(MARGIN, PAGE_H - 13 * mm, PAGE_W - MARGIN, PAGE_H - 13 * mm)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawString(MARGIN, PAGE_H - 11.5 * mm,
                 "Contrat de prestation — Plateforme de livraison "
                 "(Ouagadougou, Burkina Faso)")
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 11.5 * mm, "Page %d" % n)
    # initials (paraphes) on each page
    y = 8 * mm
    c.drawString(MARGIN, y + 3, "Paraphe Prestataire :")
    c.acroForm.textfield(name="paraphe_prestataire_p%d" % n,
                         tooltip="Paraphe Prestataire", x=MARGIN + 72, y=y,
                         width=40, height=13, fontName="Helvetica",
                         fontSize=8, borderColor=FIELD_BORDER,
                         fillColor=FIELD_BG, borderWidth=0.5)
    c.drawString(PAGE_W - MARGIN - 112, y + 3, "Paraphe Client :")
    c.acroForm.textfield(name="paraphe_client_p%d" % n,
                         tooltip="Paraphe Client", x=PAGE_W - MARGIN - 40,
                         y=y, width=40, height=13, fontName="Helvetica",
                         fontSize=8, borderColor=FIELD_BORDER,
                         fillColor=FIELD_BG, borderWidth=0.5)
    c.restoreState()


def P(t, st=BODY):
    return Paragraph(t, st)


def bullets(items):
    return [Paragraph(i, BULLET, bulletText="•") for i in items]


def table(data, widths, header=True):
    rows = [[P(x, CELLB if (header and r == 0) else CELL)
             if isinstance(x, str) else x for x in row]
            for r, row in enumerate(data)]
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9AA5B1")),
             ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("LEFTPADDING", (0, 0), (-1, -1), 4),
             ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0),
                      colors.HexColor("#DCEFE5")))
    t.setStyle(TableStyle(style))
    return t


def party_block(title, key):
    fields = [
        ("Nom / Raison sociale", "raison_sociale"),
        ("Forme juridique", "forme"),
        ("N° RCCM", "rccm"),
        ("N° IFU", "ifu"),
        ("Siège / Adresse", "adresse"),
        ("Représenté(e) par", "representant"),
        ("En qualité de", "qualite"),
        ("Téléphone", "tel"),
        ("E-mail", "email"),
    ]
    out = [P(title, H3)]
    for label, k in fields:
        out.append(Field(label, "%s_%s" % (key, k)))
    return out


def build_story():
    s = []
    s.append(Spacer(1, 4))
    s.append(P("CONTRAT DE PRESTATION DE SERVICES", H1))
    s.append(P("Conception, développement, mise en production et maintenance "
               "d'une plateforme numérique de livraison à Ouagadougou "
               "(applications Client, Vendeur, Livreur et Console de "
               "contrôle)", SUB))
    s.append(Spacer(1, 6))
    s.append(Field("Contrat n°", "contrat_numero", label_w=30 * mm,
                   width=90 * mm))
    s.append(Spacer(1, 4))
    s.append(P("ENTRE LES SOUSSIGNÉS :", H3))
    s += party_block("1. Le PRESTATAIRE", "prestataire")
    s.append(P("ci-après dénommé « le Prestataire », d'une part,", SMALL))
    s.append(Spacer(1, 4))
    s += party_block("2. Le CLIENT", "client")
    s.append(P("ci-après dénommé « le Client », d'autre part.", SMALL))
    s.append(P("Le Prestataire et le Client sont ci-après désignés "
               "individuellement « une Partie » et ensemble « les Parties ».",
               BODY))

    s.append(P("PRÉAMBULE", H2))
    s.append(P(
        "Le Client souhaite exploiter à Ouagadougou un service de livraison "
        "à la demande mettant en relation des clients, des vendeurs "
        "(commerces, restaurants, particuliers) et des livreurs utilisant un "
        "vélo, une motocyclette ou une voiture. Le Prestataire est un "
        "professionnel de la conception et du développement de logiciels. "
        "Le Client a exprimé ses besoins ; le Prestataire, après les avoir "
        "étudiés, a proposé ses services. Les Parties se sont rapprochées et "
        "ont convenu de ce qui suit."))

    s.append(P("Article 1 — Définitions", H2))
    s += bullets([
        "<b>Plateforme</b> : l'ensemble logiciel objet du Contrat, composé "
        "des Applications, du serveur (API), de la base de données et des "
        "outils d'administration.",
        "<b>Application Client</b> : application mobile permettant de "
        "commander, payer et suivre une livraison.",
        "<b>Application Vendeur</b> : application (mobile et/ou web) "
        "permettant à un vendeur de publier son offre, recevoir des "
        "commandes et demander un livreur.",
        "<b>Application Livreur</b> : application mobile permettant au "
        "livreur de s'inscrire, recevoir et exécuter des courses.",
        "<b>Console de contrôle</b> : application web réservée au Client et "
        "à ses opérateurs (« Contrôleurs ») pour superviser en temps réel "
        "les courses, les livreurs, les vendeurs et les clients.",
        "<b>Livrables</b> : code source, applications compilées, "
        "documentation et tout élément décrit en Annexe 1.",
        "<b>Recette</b> : vérification par le Client de la conformité d'un "
        "Livrable à l'Annexe 1, selon l'article 7.",
        "<b>Données personnelles</b> : toute information relative à une "
        "personne physique identifiée ou identifiable, y compris les données "
        "de localisation et les pièces d'identité.",
    ])

    s.append(P("Article 2 — Objet", H2))
    s.append(P(
        "Le Contrat a pour objet de définir les conditions dans lesquelles "
        "le Prestataire conçoit, développe, livre et met en production la "
        "Plateforme pour le compte du Client, puis en assure la garantie et, "
        "le cas échéant, la maintenance."))

    s.append(P("Article 3 — Documents contractuels", H2))
    s.append(P(
        "Le Contrat est constitué, par ordre de priorité décroissant : (1) "
        "le présent document ; (2) l'Annexe 3 — Protection des données "
        "personnelles ; (3) l'Annexe 2 — Calendrier, prix et échéancier ; "
        "(4) l'Annexe 1 — Périmètre fonctionnel et technique ; (5) les "
        "avenants signés par les deux Parties, qui prévalent sur le document "
        "qu'ils modifient. En cas de contradiction, le document de rang "
        "supérieur prévaut."))

    s.append(P("Article 4 — Périmètre et lots", H2))
    s.append(P(
        "<b>4.1 Lot 1 (version initiale — MVP)</b> : Applications Client, "
        "Vendeur et Livreur, Console de contrôle et serveur, telles que "
        "décrites en Annexe 1. Le paiement en espèces à la livraison est "
        "géré par la Plateforme dès le Lot 1."))
    s.append(P(
        "<b>4.2 Lot 2 (paiement mobile)</b> : l'intégration des services de "
        "monnaie électronique (par ex. Orange Money, Moov Money, ou un "
        "agrégateur de paiement agréé) est <b>exclue du Lot 1</b>. Elle fera "
        "l'objet d'un avenant précisant le prix et le délai, une fois que le "
        "Client aura conclu les contrats nécessaires avec le ou les "
        "établissements émetteurs ou agrégateurs agréés. Le Prestataire "
        "concevra toutefois la Plateforme de manière à permettre cette "
        "intégration ultérieure sans refonte."))
    s.append(P("<b>4.3 Hors périmètre</b>, sauf avenant : "
               "l'obtention des agréments, autorisations et déclarations "
               "administratives (le Prestataire apportant son assistance "
               "technique pour les formalités relatives aux données) ; le "
               "recrutement, la formation et la gestion des livreurs ; la "
               "production du contenu (logos, photos, catalogues, textes "
               "juridiques destinés aux utilisateurs) ; les frais des "
               "services tiers visés à l'article 8.4."))

    s.append(P("Article 5 — Obligations du Prestataire", H2))
    s += bullets([
        "Réaliser les prestations avec soin, selon les règles de l'art, dans "
        "le cadre d'une obligation de moyens.",
        "Respecter le calendrier de l'Annexe 2, sauf retard imputable au "
        "Client, à un tiers ou à un cas de force majeure.",
        "Mettre en œuvre des mesures de sécurité adaptées (chiffrement des "
        "échanges, contrôle des accès, journalisation, sauvegardes) "
        "conformément à l'Annexe 3.",
        "Informer le Client de l'avancement au moins une fois toutes les "
        "deux (2) semaines et lui donner accès à une version de test.",
        "Conseiller le Client et l'alerter sur tout risque technique, "
        "juridique ou financier dont il aurait connaissance.",
        "Remettre le code source et la documentation selon l'article 9.",
    ])

    s.append(P("Article 6 — Obligations du Client", H2))
    s += bullets([
        "Désigner un interlocuteur unique disposant du pouvoir de décision "
        "et répondre aux demandes de validation dans un délai de cinq (5) "
        "jours ouvrés.",
        "Fournir les informations, contenus, tarifs, zones de livraison et "
        "règles métier nécessaires.",
        "Ouvrir à son nom les comptes nécessaires (Google Play, Apple App "
        "Store, hébergement, cartographie, SMS, nom de domaine) et en "
        "conserver la propriété ; il peut en confier la gestion technique au "
        "Prestataire.",
        "Accomplir, en sa qualité de responsable du traitement, les "
        "formalités auprès de la Commission de l'Informatique et des "
        "Libertés (CIL) avant toute mise en production avec des données "
        "réelles.",
        "Définir et assumer seul la relation juridique avec les livreurs et "
        "les vendeurs (article 11) et publier les conditions d'utilisation "
        "et la politique de confidentialité de la Plateforme.",
        "Payer le prix aux échéances convenues.",
    ])

    s.append(P("Article 7 — Livraison et recette", H2))
    s.append(P(
        "Chaque Livrable est mis à disposition du Client sur un environnement "
        "de test. Le Client dispose de <b>dix (10) jours ouvrés</b> pour "
        "procéder à la recette et notifier par écrit les anomalies, classées "
        "comme suit : <b>bloquante</b> (empêche l'utilisation d'une fonction "
        "essentielle), <b>majeure</b> (fonction dégradée sans contournement "
        "raisonnable), <b>mineure</b> (autre). Le Prestataire corrige les "
        "anomalies bloquantes et majeures dans un délai raisonnable, puis "
        "une nouvelle période de recette de cinq (5) jours ouvrés s'ouvre "
        "pour les seuls points corrigés."))
    s.append(P(
        "La recette est prononcée par la signature d'un procès-verbal (PV). "
        "Elle est réputée acquise si, à l'expiration du délai, le Client n'a "
        "notifié aucune anomalie bloquante ou majeure, ou s'il utilise le "
        "Livrable en exploitation réelle. Les anomalies mineures n'empêchent "
        "pas la recette et sont traitées au titre de la garantie."))
    s.append(P(
        "Toute demande de modification du périmètre après validation de "
        "l'Annexe 1 donne lieu à un devis et, si elle est acceptée, à un "
        "avenant ajustant le prix et le calendrier."))

    s.append(P("Article 8 — Prix et modalités de paiement", H2))
    s.append(Field("Prix forfaitaire du Lot 1 (FCFA HT)", "prix_lot1_ht",
                   label_w=70 * mm))
    s.append(Field("TVA applicable (taux / montant)", "prix_tva",
                   label_w=70 * mm))
    s.append(Field("Prix total TTC (FCFA)", "prix_ttc", label_w=70 * mm))
    s.append(Field("Montant en toutes lettres", "prix_lettres",
                   label_w=70 * mm))
    s.append(Spacer(1, 3))
    s.append(P(
        "<b>8.1</b> Le prix est payable selon l'échéancier de l'Annexe 2 "
        "(à défaut : 30 % à la signature, 30 % à la livraison de la version "
        "de test complète, 30 % à la recette du Lot 1, 10 % à la fin de la "
        "période de garantie)."))
    s.append(P(
        "<b>8.2</b> Les factures sont payables sous quinze (15) jours "
        "par virement bancaire ou par monnaie électronique. Tout retard de "
        "paiement de plus de quinze (15) jours après mise en demeure "
        "autorise le Prestataire à suspendre ses prestations, les délais "
        "étant prorogés d'autant."))
    s.append(P(
        "<b>8.3</b> Le prix couvre les prestations décrites en Annexe 1. La "
        "maintenance après garantie fait l'objet de l'article 14."))
    s.append(P(
        "<b>8.4</b> Restent à la charge du Client, directement ou sur "
        "justificatif : hébergement et serveurs, services de cartographie "
        "et de géolocalisation, envoi de SMS (codes de vérification), "
        "comptes développeur des magasins d'applications, nom de domaine, "
        "frais des opérateurs de paiement, et plus généralement tout service "
        "tiers nécessaire à l'exploitation."))

    s.append(P("Article 9 — Propriété intellectuelle et code source", H2))
    s.append(P("Les Parties retiennent l'option cochée ci-dessous :"))
    s.append(Check("pi_option_cession",
                   "<b>Option A — Cession.</b> Sous réserve du paiement "
                   "intégral du prix, le Prestataire cède au Client, à titre "
                   "exclusif, pour le monde entier et pour toute la durée "
                   "légale de protection, les droits patrimoniaux "
                   "(reproduction, représentation, adaptation, "
                   "modification, distribution, exploitation commerciale) "
                   "sur le code et les éléments développés spécifiquement "
                   "pour le Client."))
    s.append(Check("pi_option_licence",
                   "<b>Option B — Licence.</b> Le Prestataire reste "
                   "titulaire des droits et concède au Client une licence "
                   "d'utilisation non exclusive, non transférable, pour "
                   "l'exploitation de la Plateforme au Burkina Faso, pour "
                   "la durée suivante :"))
    s.append(Field("Durée / conditions de la licence (option B)",
                   "pi_licence_conditions", label_w=70 * mm))
    s.append(P(
        "Dans tous les cas, le Prestataire conserve ses outils, savoir-faire "
        "et composants préexistants ou génériques, sur lesquels il concède "
        "au Client une licence non exclusive, gratuite et perpétuelle, "
        "limitée à l'exploitation de la Plateforme. Les composants libres "
        "(« open source ») restent soumis à leurs licences respectives. Le "
        "code source est remis au Client via un dépôt de gestion de versions "
        "(par ex. Git) accessible au Client, au plus tard à la recette du "
        "Lot 1. Le Prestataire garantit qu'à sa connaissance les Livrables "
        "ne contrefont aucun droit de tiers."))

    s.append(P("Article 10 — Données personnelles et géolocalisation", H2))
    s.append(P(
        "<b>10.1</b> Les Parties s'engagent à respecter la Loi "
        "n° 001-2021/AN du 30 mars 2021 portant protection des personnes à "
        "l'égard du traitement des données à caractère personnel, ses textes "
        "d'application et les décisions de la CIL. Le <b>Client est "
        "responsable du traitement</b> ; le <b>Prestataire agit en qualité "
        "de sous-traitant</b>, uniquement sur instruction documentée du "
        "Client, dans les conditions de l'Annexe 3."))
    s.append(P(
        "<b>10.2 Géolocalisation des livreurs.</b> La position des livreurs "
        "n'est collectée que lorsqu'ils sont connectés en statut « "
        "disponible » ou en course, jamais hors service. Les livreurs en "
        "sont informés de manière claire avant leur inscription et "
        "l'application affiche en permanence un indicateur de suivi actif."))
    s.append(P(
        "<b>10.3 Position des clients.</b> La position du client n'est "
        "collectée que pour la préparation et l'exécution d'une commande, "
        "avec son accord, et n'est communiquée au livreur et au vendeur que "
        "pour la durée de la course."))
    s.append(P(
        "<b>10.4 Pièces justificatives des livreurs.</b> Aux fins de "
        "prévention de la fraude et de sécurité des utilisateurs, la "
        "Plateforme recueille les pièces des livreurs (CNIB ou passeport, "
        "permis de conduire pour moto et voiture, certificat "
        "d'immatriculation, attestation d'assurance, photographie). Ces "
        "pièces sont stockées chiffrées, accessibles aux seuls Contrôleurs "
        "habilités, chaque consultation étant journalisée, et conservées "
        "selon les durées de l'Annexe 3."))
    s.append(P(
        "<b>10.5</b> Le Prestataire notifie au Client toute violation de "
        "données dans un délai maximal de <b>quarante-huit (48) heures</b> "
        "après en avoir pris connaissance, afin de permettre au Client de "
        "remplir ses propres obligations. À la fin du Contrat, le "
        "Prestataire restitue au Client l'ensemble des données puis détruit "
        "ses copies, sauf obligation légale de conservation."))

    s.append(P("Article 11 — Statut des livreurs et des vendeurs", H2))
    s.append(P(
        "Le Client détermine seul le modèle de collaboration avec les "
        "livreurs (salariés, travailleurs indépendants, ou personnel d'une "
        "société partenaire) et avec les vendeurs. Il lui appartient de "
        "respecter la législation applicable, notamment la Loi "
        "n° 028-2008/AN du 13 mai 2008 portant Code du travail, la "
        "réglementation de la sécurité sociale (CNSS), le code de la route "
        "(permis, casque, assurance obligatoire) et la réglementation "
        "fiscale. Le Prestataire n'est partie à aucune de ces relations. Les "
        "fonctionnalités de la Plateforme (affectation des courses, "
        "notation, suspension de compte) sont paramétrables par le Client, "
        "qui en assume l'usage."))

    s.append(P("Article 12 — Confidentialité", H2))
    s.append(P(
        "Chaque Partie s'engage à garder confidentielles les informations de "
        "l'autre Partie dont elle a connaissance à l'occasion du Contrat "
        "(données commerciales, techniques, financières, données des "
        "utilisateurs), à ne les utiliser que pour l'exécution du Contrat et "
        "à n'y donner accès qu'aux personnes qui en ont besoin et sont "
        "tenues à la même obligation. Cette obligation dure pendant le "
        "Contrat et <b>cinq (5) ans</b> après sa fin. Elle ne s'applique pas "
        "aux informations publiques ou dont la divulgation est exigée par la "
        "loi ou une autorité judiciaire."))

    s.append(P("Article 13 — Garantie", H2))
    s.append(Field("Durée de la garantie (mois après mise en production)",
                   "garantie_mois", label_w=95 * mm))
    s.append(P(
        "À défaut d'indication, la garantie est de <b>trois (3) mois</b> à "
        "compter de la mise en production du Lot 1. Pendant cette période, "
        "le Prestataire corrige gratuitement les anomalies de conformité à "
        "l'Annexe 1. Sont exclues : les modifications effectuées par le "
        "Client ou un tiers, l'usage non conforme, les défaillances des "
        "services tiers (hébergeur, opérateurs télécoms, cartographie, "
        "magasins d'applications) et les évolutions des systèmes "
        "d'exploitation postérieures à la recette."))

    s.append(P("Article 14 — Hébergement, maintenance et évolutions", H2))
    s.append(Check("maintenance_oui",
                   "Le Client souscrit, à l'issue de la garantie, à la "
                   "maintenance (corrective, mises à jour de sécurité et de "
                   "compatibilité, supervision, sauvegardes) au tarif "
                   "mensuel ci-dessous, pour une durée de douze (12) mois "
                   "renouvelable tacitement, résiliable avec un préavis de "
                   "deux (2) mois."))
    s.append(Field("Redevance mensuelle de maintenance (FCFA HT)",
                   "maintenance_mensuel", label_w=80 * mm))
    s.append(Field("Délai d'intervention (anomalie bloquante)",
                   "maintenance_delai", label_w=80 * mm))
    s.append(P(
        "Les évolutions fonctionnelles font l'objet de devis séparés."))

    s.append(P("Article 15 — Responsabilité", H2))
    s.append(P(
        "Le Prestataire est tenu d'une obligation de moyens. Sa "
        "responsabilité ne peut être engagée qu'en cas de faute prouvée et "
        "est limitée aux dommages directs, dans la limite du montant total "
        "effectivement payé par le Client au titre du Contrat. Aucune Partie "
        "n'est responsable des dommages indirects (perte de chiffre "
        "d'affaires, de clientèle, d'image). Le Prestataire n'est pas "
        "responsable de l'exploitation du service de livraison (accidents, "
        "pertes ou détériorations de colis, litiges entre utilisateurs), qui "
        "relève du Client. Ces limitations ne s'appliquent pas en cas de "
        "faute lourde ou dolosive, ni aux manquements à la confidentialité "
        "ou à la protection des données."))

    s.append(P("Article 16 — Force majeure", H2))
    s.append(P(
        "Aucune Partie n'est responsable d'un manquement causé par un "
        "événement de force majeure, entendu comme un événement échappant à "
        "son contrôle, imprévisible et irrésistible (notamment : troubles "
        "graves à l'ordre public, décisions des autorités, coupures "
        "généralisées d'électricité ou d'internet, catastrophes). La Partie "
        "affectée en informe l'autre sans délai ; les obligations sont "
        "suspendues pendant la durée de l'événement. Si celui-ci dure plus "
        "de soixante (60) jours, chaque Partie peut résilier le Contrat par "
        "écrit, les prestations réalisées restant dues."))

    s.append(P("Article 17 — Durée et résiliation", H2))
    s.append(P(
        "Le Contrat entre en vigueur à la date de sa signature par la "
        "dernière Partie et prend fin à l'expiration de la garantie, sous "
        "réserve de l'article 14 et des clauses qui survivent par nature "
        "(articles 9, 10, 12, 15 et 20)."))
    s.append(P(
        "<b>Résiliation pour manquement</b> : en cas de manquement grave "
        "d'une Partie non réparé dans les trente (30) jours suivant une mise "
        "en demeure écrite, l'autre Partie peut résilier le Contrat de plein "
        "droit. <b>Résiliation anticipée par le Client</b> : le Client peut "
        "mettre fin au Contrat à tout moment par écrit avec un préavis de "
        "quinze (15) jours ; il paie alors les prestations réalisées à la "
        "date d'effet et l'échéance en cours. Dans tous les cas, le "
        "Prestataire remet les Livrables payés, en l'état."))

    s.append(P("Article 18 — Sous-traitance et non-sollicitation", H2))
    s.append(P(
        "Le Prestataire peut confier une partie des travaux à des tiers "
        "qualifiés, en en informant préalablement le Client et en restant "
        "seul responsable à son égard ; tout sous-traitant ayant accès aux "
        "données personnelles est soumis aux mêmes obligations que le "
        "Prestataire. Pendant le Contrat et douze (12) mois après sa fin, "
        "aucune Partie ne sollicite ni n'embauche directement un membre du "
        "personnel de l'autre Partie ayant participé au projet sans son "
        "accord écrit."))

    s.append(P("Article 19 — Dispositions diverses", H2))
    s += bullets([
        "Le Contrat exprime l'intégralité de l'accord des Parties et "
        "remplace tout échange antérieur sur le même objet. Il ne peut être "
        "modifié que par avenant écrit signé des deux Parties.",
        "Les notifications sont faites par écrit aux adresses indiquées en "
        "tête du Contrat (courrier remis contre décharge ou e-mail avec "
        "accusé de réception).",
        "Le Contrat peut être signé de manière manuscrite ou électronique ; "
        "conformément à la Loi n° 045-2009/AN portant réglementation des "
        "services et des transactions électroniques, la signature "
        "électronique a la même valeur que la signature manuscrite. Les "
        "exemplaires signés séparément forment ensemble un seul et même "
        "acte.",
        "Si une clause est déclarée nulle, les autres clauses demeurent "
        "applicables.",
        "Le Contrat est rédigé en langue française, qui fait foi.",
    ])

    s.append(P("Article 20 — Droit applicable et règlement des litiges",
               H2))
    s.append(P(
        "Le Contrat est soumis au droit burkinabè et aux Actes uniformes de "
        "l'OHADA. En cas de différend, les Parties recherchent d'abord une "
        "solution amiable pendant trente (30) jours à compter de la "
        "notification écrite du différend. À défaut, le litige est soumis à "
        "l'option cochée ci-dessous :"))
    s.append(Check("litige_arbitrage",
                   "Arbitrage selon le règlement du Centre d'Arbitrage, de "
                   "Médiation et de Conciliation de Ouagadougou (CAMC-O), "
                   "par un arbitre unique, en langue française, siège à "
                   "Ouagadougou."))
    s.append(Check("litige_tribunal",
                   "Compétence exclusive du Tribunal de commerce de "
                   "Ouagadougou."))
    s.append(Spacer(1, 6))
    s.append(P(
        "Avertissement : ce modèle a été préparé à titre d'aide à la "
        "rédaction. Il est recommandé de le faire relire par un avocat ou un "
        "conseil juridique inscrit au Burkina Faso avant signature, "
        "notamment les références légales et les durées de conservation.",
        SMALL))

    # ---------------- Annexes ----------------
    s.append(PageBreak())
    s.append(P("ANNEXE 1 — Périmètre fonctionnel et technique (Lot 1)", H2))
    s.append(P(
        "Cette annexe décrit le périmètre minimal. Les Parties peuvent la "
        "préciser par un cahier des charges détaillé validé par écrit, qui "
        "s'y intègre alors."))
    w1, w2 = 38 * mm, CONTENT_W - 38 * mm
    s.append(table([
        ["Composant", "Fonctionnalités incluses"],
        ["Application Client (Android, iOS)",
         "Inscription par numéro de téléphone avec code SMS ; adresse par "
         "épingle sur la carte + point de repère en texte libre et adresses "
         "favorites ; catalogue des vendeurs et commande, ou course "
         "« colis » d'un point A à un point B ; choix du véhicule (vélo, "
         "moto, voiture) et prix affiché avant validation ; suivi du livreur "
         "en temps réel ; appel et messagerie avec le livreur ; code de "
         "confirmation remis à la réception ; paiement en espèces ; "
         "historique, reçus, notation, réclamations ; notifications."],
        ["Application Vendeur (Android + web)",
         "Profil et horaires ; catalogue (produits, prix, photos, "
         "disponibilité) ; réception et acceptation des commandes ; temps "
         "de préparation ; demande de livreur ; suivi ; historique et "
         "relevé des ventes et commissions."],
        ["Application Livreur (Android)",
         "Inscription avec dépôt des pièces (CNIB, permis, carte grise, "
         "assurance, photo + selfie de contrôle) ; type et immatriculation "
         "du véhicule ; validation par un Contrôleur avant activation ; "
         "statut disponible / indisponible ; réception, acceptation ou refus "
         "des courses ; navigation ; preuve de livraison (code client, "
         "photo) ; encaissement espèces et solde dû ; gains ; bouton "
         "d'alerte (SOS) ; fonctionnement en réseau faible."],
        ["Console de contrôle (web)",
         "Carte en temps réel des livreurs et des courses ; affectation "
         "automatique (livreur le plus proche, adapté au type de véhicule) "
         "et manuelle ; validation des dossiers livreurs et vendeurs ; "
         "gestion des zones, des tarifs (base + distance, par véhicule) et "
         "des commissions ; gestion des litiges et remboursements ; "
         "suspension de comptes ; suivi de l'argent liquide détenu par les "
         "livreurs ; tableaux de bord et exports ; rôles et droits des "
         "Contrôleurs ; journal d'audit des actions sensibles."],
        ["Serveur et infrastructure",
         "API sécurisée (HTTPS) ; base de données ; notifications push et "
         "SMS ; sauvegardes quotidiennes ; environnements de test et de "
         "production ; supervision ; architecture prête pour le paiement "
         "mobile (Lot 2)."],
        ["Exigences générales",
         "Interface en français (autres langues en option) ; compatibilité "
         "Android 8.0 et suivants sur téléphones d'entrée de gamme ; "
         "consommation de données réduite ; publication sur Google Play et "
         "App Store sous les comptes du Client ; documentation technique et "
         "guide d'utilisation de la Console ; formation des Contrôleurs "
         "(une session)."],
    ], [w1, w2]))
    s.append(Spacer(1, 4))
    s.append(P("Précisions ou exclusions convenues :", H3))
    s.append(Field("", "annexe1_precisions", label_w=0, lines=6))

    s.append(P("ANNEXE 2 — Calendrier, prix et échéancier", H2))
    cw = [62 * mm, 34 * mm, 34 * mm, CONTENT_W - 130 * mm]

    def cell_field(name, w):
        return Field("", name, width=w - 8, label_w=0, height=13)

    rows = [["Étape / Livrable", "Date prévue", "% du prix",
             "Montant (FCFA)"]]
    steps = ["Signature du Contrat (acompte)",
             "Cahier des charges et maquettes validés",
             "Version de test complète du Lot 1",
             "Recette du Lot 1 et mise en production",
             "Fin de la période de garantie"]
    for i, st in enumerate(steps):
        rows.append([st, cell_field("ech_%d_date" % i, cw[1]),
                     cell_field("ech_%d_pct" % i, cw[2]),
                     cell_field("ech_%d_montant" % i, cw[3])])
    s.append(table(rows, cw))
    s.append(P("À défaut de remplissage, l'échéancier par défaut de "
               "l'article 8.1 s'applique (30 % / 0 % / 30 % / 30 % / 10 %).",
               SMALL))
    s.append(Field("Date de démarrage des travaux", "date_demarrage",
                   label_w=70 * mm))
    s.append(Field("Durée prévisionnelle du Lot 1 (semaines)",
                   "duree_lot1", label_w=70 * mm))
    s.append(Field("Coordonnées de paiement (Prestataire)",
                   "paiement_coordonnees", label_w=70 * mm))

    s.append(Spacer(1, 6))
    s.append(P("ANNEXE 3 — Protection des données personnelles", H2))
    s.append(P(
        "Le Prestataire, sous-traitant, s'engage à : traiter les données "
        "uniquement pour les finalités ci-dessous et sur instruction du "
        "Client ; garantir la confidentialité par ses personnels ; "
        "chiffrer les données en transit et les données sensibles au repos "
        "(pièces d'identité) ; appliquer le principe du moindre privilège et "
        "journaliser les accès ; ne pas transférer les données hors du "
        "Burkina Faso sans l'accord écrit du Client et le respect des "
        "conditions légales de transfert ; aider le Client à répondre aux "
        "demandes des personnes (accès, rectification, suppression, "
        "opposition) et à réaliser les formalités auprès de la CIL."))
    cw3 = [36 * mm, 46 * mm, 50 * mm, CONTENT_W - 132 * mm]
    s.append(table([
        ["Personnes", "Données", "Finalité", "Durée de conservation "
         "indicative*"],
        ["Clients", "Nom, téléphone, adresses, position lors d'une "
         "commande, historique", "Exécution des commandes, support, "
         "facturation", "Compte actif + 3 ans ; positions : 12 mois"],
        ["Livreurs", "Identité, pièces (CNIB, permis, carte grise, "
         "assurance), photo, véhicule, positions en service, gains",
         "Vérification d'identité, lutte contre la fraude, sécurité, "
         "affectation et suivi des courses, paiement",
         "Relation + 5 ans (pièces) ; positions : 12 mois"],
        ["Vendeurs", "Identité du gérant, RCCM/IFU, coordonnées, "
         "ventes", "Gestion du compte, commandes, reversements",
         "Relation + 10 ans (pièces comptables)"],
        ["Contrôleurs", "Identifiants, journaux d'actions",
         "Sécurité et traçabilité", "1 an glissant"],
    ], cw3))
    s.append(P("* Durées à confirmer par le Client au regard de la "
               "réglementation et des recommandations de la CIL.", SMALL))
    s.append(Field("Lieu d'hébergement des données", "hebergement_lieu",
                   label_w=60 * mm))
    s.append(Field("Contact données (Client)", "contact_donnees_client",
                   label_w=60 * mm))
    s.append(Field("Contact données (Prestataire)",
                   "contact_donnees_prestataire", label_w=60 * mm))

    # ---------------- Signatures ----------------
    s.append(Spacer(1, 10))
    sig = []
    sig.append(P("SIGNATURES", H2))
    sig.append(Field("Fait à", "fait_a", label_w=18 * mm, width=85 * mm))
    sig.append(Field("Le", "fait_le", label_w=18 * mm, width=85 * mm))
    sig.append(P("en deux (2) exemplaires originaux, un pour chaque Partie. "
                 "Chaque Partie paraphe toutes les pages et signe ci-dessous "
                 "(signature manuscrite après impression, ou signature "
                 "électronique dans les zones prévues).", BODY))
    sig.append(Spacer(1, 6))
    bw = (CONTENT_W - 8 * mm) / 2
    sig_table = Table([[SignatureBox("Pour le PRESTATAIRE", "prestataire", bw),
                        SignatureBox("Pour le CLIENT", "client", bw)]],
                      colWidths=[bw + 4 * mm, bw + 4 * mm])
    sig_table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0),
                                   ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                   ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    sig.append(sig_table)
    s.append(KeepTogether(sig))
    return s


def add_signature_fields(src, dst):
    reader = PdfReader(src)
    writer = PdfWriter()
    writer.append(reader)
    acro = writer._root_object["/AcroForm"]
    fields = acro["/Fields"]
    for page_idx, name, x, y, w, h in SIG_FIELDS:
        page = writer.pages[page_idx]
        sig = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Sig"),
            NameObject("/T"): TextStringObject(name),
            NameObject("/TU"): TextStringObject(
                "Signature électronique — " + name.split("_")[1]),
            NameObject("/Rect"): ArrayObject([FloatObject(x),
                                              FloatObject(y),
                                              FloatObject(x + w),
                                              FloatObject(y + h)]),
            NameObject("/F"): NumberObject(4),
            NameObject("/P"): page.indirect_reference,
            NameObject("/MK"): DictionaryObject({
                NameObject("/BC"): ArrayObject([FloatObject(0.54),
                                                FloatObject(0.64),
                                                FloatObject(0.84)])}),
        })
        ref = writer._add_object(sig)
        if "/Annots" not in page:
            page[NameObject("/Annots")] = ArrayObject()
        page["/Annots"].append(ref)
        fields.append(ref)
    acro[NameObject("/SigFlags")] = NumberObject(1)
    writer.add_metadata({
        "/Title": "Contrat de prestation — Plateforme de livraison "
                  "Ouagadougou",
        "/Subject": "Conception, développement et maintenance d'une "
                    "plateforme de livraison (Client, Vendeur, Livreur, "
                    "Console de contrôle)",
        "/Keywords": "contrat, livraison, Ouagadougou, Burkina Faso, OHADA",
    })
    with open(dst, "wb") as f:
        writer.write(f)


def main():
    doc = SimpleDocTemplate(TMP, pagesize=A4, leftMargin=MARGIN,
                            rightMargin=MARGIN, topMargin=18 * mm,
                            bottomMargin=17 * mm,
                            title="Contrat de prestation — Plateforme de "
                                  "livraison Ouagadougou")
    doc.build(build_story(), onFirstPage=on_page, onLaterPages=on_page)
    add_signature_fields(TMP, OUT)
    os.remove(TMP)
    print("Écrit :", OUT)


if __name__ == "__main__":
    main()
