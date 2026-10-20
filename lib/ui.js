import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  Info,
  Loader2,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";

export const RISK_STYLES = {
  Faible: {
    label: "Risque faible",
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    bar: "bg-emerald-500",
    panel: "bg-emerald-50 ring-emerald-200",
    icon: CheckCircle2,
    iconColor: "text-emerald-600",
  },
  Suspect: {
    label: "Suspect",
    badge: "bg-amber-100 text-amber-900 ring-amber-200",
    bar: "bg-amber-500",
    panel: "bg-amber-50 ring-amber-200",
    icon: AlertTriangle,
    iconColor: "text-amber-600",
  },
  "Très dangereux": {
    label: "Très dangereux",
    badge: "bg-rose-100 text-rose-800 ring-rose-200",
    bar: "bg-rose-500",
    panel: "bg-rose-50 ring-rose-200",
    icon: ShieldAlert,
    iconColor: "text-rose-600",
  },
  Indéterminé: {
    label: "Indéterminé",
    badge: "bg-slate-200 text-slate-700 ring-slate-300",
    bar: "bg-slate-400",
    panel: "bg-slate-50 ring-slate-200",
    icon: ShieldQuestion,
    iconColor: "text-slate-500",
  },
};

export const FALLBACK_RISK_STYLE = RISK_STYLES.Indéterminé;

export const EXAMPLES = [
  {
    id: "colis",
    emoji: "📦",
    label: "Faux SMS Colis",
    text: "Chronopost : Votre colis ne rentre pas dans la boite aux lettres, un supplement de 2,99 EUR est requis. Merci de confirmer votre adresse et de regler les frais sous 24h sur chronopost-livraison-securisee.com sinon le colis nous sera retourne.",
  },
  {
    id: "banque",
    emoji: "🏦",
    label: "Alerte Sécurité Banque",
    text: "URGENT : Activite anormale de 480 EUR detectee sur votre compte. Un conseiller doit valider l'operation avec vous. Cliquez sur ce lien pour annuler le paiement et confirmez votre code a 6 chiffres. Sans reponse sous 30 minutes, votre carte sera bloquee.",
  },
  {
    id: "maman",
    emoji: "💬",
    label: "Message Légitime",
    text: "Coucou c'est maman, n'oublie pas de passer chercher le pain en rentrant et dis-moi si tu viens diner ce soir. Je t'aime, a tout a l'heure !",
  },
];
