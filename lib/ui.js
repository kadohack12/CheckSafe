import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";

/**
 * Visual treatment per risk level. Keeping this next to the copy means the
 * interface cannot show a "safe" colour for a dangerous verdict.
 */
export const RISK_STYLES = {
  Low: {
    label: "Looks safe",
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    bar: "bg-emerald-500",
    panel: "bg-emerald-50 ring-emerald-200",
    icon: CheckCircle2,
    iconColor: "text-emerald-600",
  },
  Suspicious: {
    label: "Suspicious",
    badge: "bg-amber-100 text-amber-900 ring-amber-200",
    bar: "bg-amber-500",
    panel: "bg-amber-50 ring-amber-200",
    icon: AlertTriangle,
    iconColor: "text-amber-600",
  },
  "Very dangerous": {
    label: "Very dangerous",
    badge: "bg-rose-100 text-rose-800 ring-rose-200",
    bar: "bg-rose-500",
    panel: "bg-rose-50 ring-rose-200",
    icon: ShieldAlert,
    iconColor: "text-rose-600",
  },
  Undetermined: {
    label: "Not sure yet",
    badge: "bg-slate-200 text-slate-700 ring-slate-300",
    bar: "bg-slate-400",
    panel: "bg-slate-50 ring-slate-200",
    icon: ShieldQuestion,
    iconColor: "text-slate-500",
  },
};

export const FALLBACK_RISK_STYLE = RISK_STYLES.Undetermined;

export const EXAMPLES = [
  {
    id: "parcel",
    emoji: "📦",
    label: "Fake delivery SMS",
    text: "Your parcel could not be delivered because the address is incomplete. A redelivery fee of 2.99 EUR is required. Please confirm your address and pay within 24h at parcel-redelivery-secure-pay.com or the parcel will be returned to sender.",
  },
  {
    id: "bank",
    emoji: "🏦",
    label: "Bank security alert",
    text: "URGENT: An unusual transaction of 480 EUR was detected on your account. A bank agent must validate the operation with you. Click this link to cancel the payment and confirm your 6-digit code. Without a reply within 30 minutes your card will be blocked.",
  },
  {
    id: "family",
    emoji: "💬",
    label: "Legitimate message",
    text: "Hi, it's mum. Don't forget to pick up some bread on your way home, and let me know if you're coming for dinner tonight. Love you, see you later!",
  },
];
