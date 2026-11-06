# -*- coding: utf-8 -*-
"""Version courte du contrat (PDF signable, champs remplissables).

Usage : python3 docs/contrat/generate_contract_short.py
Sortie : docs/contrat/Contrat_Court_Plateforme_Livraison_Ouagadougou.pdf
"""
import os

from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

import generate_contract as g

OUT = os.path.join(g.HERE, "Contrat_Court_Plateforme_Livraison_Ouagadougou.pdf")
TMP = os.path.join(g.HERE, "_tmp_contract_short.pdf")
P, H2, H3, SMALL, BODY = g.P, g.H2, g.H3, g.SMALL, g.BODY


def party(title, key):
    out = [P(title, H3)]
    for label, k in [("Nom / Raison sociale", "raison_sociale"),
                     ("RCCM / IFU", "rccm_ifu"),
                     ("Adresse", "adresse"),
                     ("Représenté(e) par, qualité", "representant"),
                     ("Téléphone / E-mail", "contact")]:
        out.append(g.Field(label, "%s_%s" % (key, k), label_w=52 * mm))
    return out


def story():
    s = [Spacer(1, 2),
         P("CONTRAT DE PRESTATION DE SERVICES (VERSION COURTE)", g.H1),
         P("Développement d'une plateforme de livraison à Ouagadougou : "
           "applications Client, Vendeur, Livreur et Console de contrôle",
           g.SUB),
         Spacer(1, 6),
         g.Field("Contrat n°", "contrat_numero", label_w=30 * mm,
                 width=90 * mm)]
    s += party("Le PRESTATAIRE", "prestataire")
    s += party("Le CLIENT", "client")

    s.append(P("1. Objet", H2))
    s.append(P(
        "Le Prestataire conçoit, développe, livre et met en production pour "
        "le Client une plateforme de livraison à la demande (vélo, moto, "
        "voiture) comprenant : une application Client, une application "
        "Vendeur, une application Livreur et une Console web de contrôle, "
        "ainsi que le serveur associé."))

    s.append(P("2. Périmètre", H2))
    s.append(P(
        "<b>Lot 1 (inclus)</b> : commande et devis, choix du véhicule, suivi "
        "en temps réel, code de livraison, paiement en espèces, gestion des "
        "commandes vendeur, inscription des livreurs avec pièces (CNIB, "
        "permis, carte grise, assurance, selfie) validées par un contrôleur, "
        "affectation des courses, suivi de l'argent encaissé, bouton SOS, "
        "tableaux de bord, journal d'audit. <b>Lot 2 (exclu, avenant "
        "ultérieur)</b> : paiement par mobile money. <b>Hors périmètre</b> : "
        "autorisations administratives, gestion des livreurs, contenus, "
        "frais des services tiers (hébergement, SMS, cartes, magasins "
        "d'applications), qui restent à la charge du Client."))

    s.append(P("3. Prix et paiement", H2))
    s.append(g.Field("Prix forfaitaire Lot 1 (FCFA HT)", "prix_lot1_ht",
                     label_w=70 * mm))
    s.append(g.Field("Prix total TTC (FCFA)", "prix_ttc", label_w=70 * mm))
    s.append(P(
        "Échéancier : 30 % à la signature, 30 % à la livraison de la version "
        "de test, 30 % à la recette, 10 % à la fin de la garantie. Factures "
        "payables sous 15 jours. En cas de retard de paiement de plus de 15 "
        "jours après mise en demeure, le Prestataire peut suspendre ses "
        "travaux ; les délais sont prolongés d'autant."))

    s.append(P("4. Délais et recette", H2))
    s.append(g.Field("Date de démarrage", "date_demarrage", label_w=70 * mm))
    s.append(g.Field("Durée prévue du Lot 1 (semaines)", "duree_lot1",
                     label_w=70 * mm))
    s.append(P(
        "Le Client dispose de 10 jours ouvrés pour tester chaque livraison "
        "et signaler par écrit les anomalies bloquantes ou majeures, que le "
        "Prestataire corrige. La recette est constatée par un procès-verbal "
        "signé, ou réputée acquise en l'absence de réserve dans ce délai ou "
        "en cas d'exploitation réelle. Toute modification du périmètre fait "
        "l'objet d'un devis et d'un avenant."))

    s.append(P("5. Propriété et code source", H2))
    s.append(P(
        "Après paiement intégral du prix, le Prestataire cède au Client les "
        "droits patrimoniaux sur le code développé spécifiquement pour lui. "
        "Le Prestataire conserve ses outils et composants préexistants, sur "
        "lesquels il accorde au Client une licence d'utilisation gratuite et "
        "perpétuelle limitée à la plateforme. Le code source est remis au "
        "Client via un dépôt Git au plus tard à la recette."))

    s.append(P("6. Données personnelles et géolocalisation", H2))
    s.append(P(
        "Les Parties respectent la Loi n° 001-2021/AN relative à la "
        "protection des données personnelles. Le Client est responsable du "
        "traitement et accomplit les formalités auprès de la CIL avant la "
        "mise en production ; le Prestataire agit en sous-traitant, sur ses "
        "instructions. Les livreurs ne sont géolocalisés que lorsqu'ils sont "
        "en service (en ligne ou en course), après information claire. La "
        "position des clients n'est utilisée que pour leurs commandes. Les "
        "pièces des livreurs sont stockées chiffrées, consultées par les "
        "seuls contrôleurs habilités, chaque accès étant journalisé. Toute "
        "violation de données est signalée au Client sous 48 heures."))

    s.append(P("7. Livreurs", H2))
    s.append(P(
        "Le Client choisit et assume seul la relation avec les livreurs "
        "(salariés, indépendants ou société partenaire) dans le respect du "
        "Code du travail, de la CNSS, du code de la route et de l'assurance "
        "obligatoire. Le Prestataire n'est partie à aucune de ces relations."))

    s.append(P("8. Confidentialité, garantie, responsabilité", H2))
    s.append(P(
        "Chaque Partie garde confidentielles les informations de l'autre "
        "pendant le contrat et 5 ans après. Le Prestataire corrige "
        "gratuitement les anomalies pendant <b>3 mois</b> après la mise en "
        "production. Il est tenu d'une obligation de moyens ; sa "
        "responsabilité est limitée aux dommages directs, dans la limite des "
        "sommes payées, sauf faute lourde, et ne couvre pas l'exploitation "
        "du service de livraison ni les services tiers. La maintenance après "
        "garantie fait l'objet d'un accord séparé."))

    s.append(P("9. Résiliation et litiges", H2))
    s.append(P(
        "En cas de manquement grave non corrigé 30 jours après mise en "
        "demeure, l'autre Partie peut résilier le contrat. Le Client peut "
        "aussi y mettre fin avec 15 jours de préavis en payant les travaux "
        "réalisés. Le contrat est régi par le droit burkinabè et les Actes "
        "uniformes OHADA. Après 30 jours de recherche d'un accord amiable, "
        "le litige est soumis (cocher) :"))
    s.append(g.Check("litige_arbitrage",
                     "à l'arbitrage du CAMC-O (Ouagadougou), arbitre unique ;"))
    s.append(g.Check("litige_tribunal",
                     "au Tribunal de commerce de Ouagadougou."))
    s.append(P(
        "Le contrat peut être signé de façon manuscrite ou électronique (Loi "
        "n° 045-2009/AN). Il ne peut être modifié que par avenant écrit. "
        "Avertissement : modèle à faire relire par un conseil juridique au "
        "Burkina Faso avant signature.", SMALL))

    sig = [P("SIGNATURES", H2),
           g.Field("Fait à", "fait_a", label_w=18 * mm, width=85 * mm),
           g.Field("Le", "fait_le", label_w=18 * mm, width=85 * mm),
           P("en deux (2) exemplaires originaux.", BODY), Spacer(1, 4)]
    bw = (g.CONTENT_W - 8 * mm) / 2
    t = Table([[g.SignatureBox("Pour le PRESTATAIRE", "prestataire", bw),
                g.SignatureBox("Pour le CLIENT", "client", bw)]],
              colWidths=[bw + 4 * mm, bw + 4 * mm])
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    sig.append(t)
    s.append(KeepTogether(sig))
    return s


def main():
    doc = SimpleDocTemplate(TMP, pagesize=A4, leftMargin=g.MARGIN,
                            rightMargin=g.MARGIN, topMargin=18 * mm,
                            bottomMargin=17 * mm,
                            title="Contrat court - Plateforme de livraison")
    doc.build(story(), onFirstPage=g.on_page, onLaterPages=g.on_page)
    g.add_signature_fields(TMP, OUT)
    os.remove(TMP)
    w = PdfWriter(clone_from=PdfReader(OUT))
    w.add_metadata({"/Title": "Contrat de prestation (version courte) - "
                              "Plateforme de livraison Ouagadougou"})
    with open(OUT, "wb") as f:
        w.write(f)
    print("Écrit :", OUT)


if __name__ == "__main__":
    main()
