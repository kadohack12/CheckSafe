# CheckSafe — Assistant de détection des arnaques numériques

> Un doute sur un message ? Vérifions ensemble en toute tranquillité.

CheckSafe aide les personnes non techniques à repérer les tentatives d'arnaque,
de phishing et d'ingénierie sociale dans les **SMS**, **e-mails** et **messages
WhatsApp**. On colle le message suspect, on clique sur « Analyser », et CheckSafe
explique en langage simple le niveau de risque, les pièges détectés et les
actions à faire.

Projet réalisé pour le hackathon **SafeSpace**.

## Fonctionnalités

- Analyse d'un message et restitution en 5 points : niveau de risque, résumé en
  clair, pièges détectés, actions recommandées, phrase rassurante.
- Niveaux de risque : `Faible`, `Suspect`, `Très dangereux`, `Indéterminé`
  (badge vert / orange / rouge / gris).
- 3 exemples pré-remplis (faux SMS colis, alerte bancaire, message légitime)
  pour tester en un clic.
- **Repli automatique** : Gemini est appelé en premier, puis Groq prend le relais
  si Gemini échoue ou dépasse son quota. Si les deux échouent, l'application
  répond en mode dégradé (message de prudence, jamais un faux verdict).
- Message présenté au modèle comme une **donnée non fiable**, pour limiter les
  détournements de prompt de type « ignore les instructions précédentes ».

## Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [Tailwind CSS](https://tailwindcss.com/)
- [lucide-react](https://lucide.dev/) pour les icônes
- [@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai)
  (modèle `gemini-flash-latest`, repli sur `gemini-2.5-flash`)
- [groq-sdk](https://www.npmjs.com/package/groq-sdk) (repli, modèles
  `openai/gpt-oss-120b` puis `openai/gpt-oss-20b`)

## Démarrage

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les clés API
cp .env.example .env.local
# puis renseigner GEMINI_API_KEY et GROQ_API_KEY

# 3. Lancer le serveur de développement
npm run dev
```

L'application est disponible sur <http://localhost:3000>.

## Variables d'environnement

| Variable              | Obligatoire | Description                                                                 |
| --------------------- | ----------- | --------------------------------------------------------------------------- |
| `GEMINI_API_KEY`      | oui         | Clé Google AI Studio, utilisée par le fournisseur principal.                |
| `GROQ_API_KEY`        | oui         | Clé Groq, utilisée par le repli automatique.                                |
| `GEMINI_MODELS`       | non         | Défaut : `gemini-flash-latest,gemini-2.5-flash`.                            |
| `GROQ_MODELS`         | non         | Défaut : `openai/gpt-oss-120b,openai/gpt-oss-20b`.                          |
| `PROVIDER_TIMEOUT_MS` | non         | Défaut : `15000`. Délai maximal par tentative de modèle.                    |
| `TOTAL_BUDGET_MS`     | non         | Défaut : `50000`. Budget total de l'analyse, sous `maxDuration` (60 s).     |

Les deux variables de modèles acceptent une **liste ordonnée**. Chaque entrée
est essayée jusqu'à obtenir une réponse exploitable : un modèle retiré par le
fournisseur fait basculer automatiquement sur le suivant, sans intervention.

## API

### `POST /api/analyze`

Requête :

```json
{ "message": "Votre colis est bloqué, cliquez ici pour payer 2,99 EUR" }
```

Réponse `200` :

```json
{
  "niveau_risque": "Très dangereux",
  "resume_simple": "Ce message ressemble fortement à une arnaque au faux colis.",
  "pieges_detectes": ["Fausse urgence", "Lien non officiel", "Demande de paiement"],
  "actions_conseillees": [
    "Ne cliquez sur aucun lien de ce message.",
    "Vérifiez le suivi depuis le site officiel du transporteur.",
    "Signalez le SMS au 33700."
  ],
  "phrase_rassurante": "Vous avez eu le bon réflexe en vérifiant : rien ne presse, aucun colis n'est perdu.",
  "meta": {
    "provider": "gemini",
    "degraded": false,
    "provider_errors": [],
    "duration_ms": 1843
  }
}
```

Codes d'erreur : `400` (message vide ou JSON invalide), `413` (message trop long,
limite 4000 caractères), `500` (erreur inattendue).

## Structure du projet

```
app/
  api/analyze/route.js   # Route API : validation, appel modèle, repli
  globals.css            # Tailwind + styles globaux
  layout.js              # Layout racine, métadonnées
  page.js                # Interface utilisateur
lib/
  analyze.js             # Orchestration Gemini -> Groq, parsing et normalisation
  constants.js           # Constantes partagées client/serveur (limite de saisie)
  prompt.js              # System prompt et construction du prompt utilisateur
  ui.js                  # Styles par niveau de risque et exemples pré-remplis
```

## Déploiement sur Vercel

1. Importer le dépôt `kadohack12/CheckSafe` sur <https://vercel.com/new>.
   Vercel détecte Next.js automatiquement, aucune configuration de build à
   saisir.
2. Renseigner les variables d'environnement dans **Settings → Environment
   Variables** (Production, Preview et Development) :
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
3. Déployer.

Sans ces deux clés, l'application se déploie et s'affiche normalement, mais
`/api/analyze` répond en mode dégradé (`degraded: true`) : c'est volontaire,
l'application n'invente jamais de verdict.

`vercel.json` fixe `maxDuration` à 60 s pour la route d'analyse. Le pire cas
d'exécution est de 45 s (Gemini 15 s, puis deux modèles Groq 15 s), ce qui
laisse une marge pour renvoyer le mode dégradé plutôt qu'un `504`. Si le
projet Vercel utilise l'ancien plafond de 10 s (Hobby, Fluid Compute
désactivé), réduire `PROVIDER_TIMEOUT_MS`.

## Qualité

```bash
npm run lint     # ESLint (configuration next/core-web-vitals)
npm run build    # Build de production
```

Vérifications passées : lint sans avertissement, build sans erreur, validation
d'entrée testée (corps vide, JSON invalide, dépassement de longueur) et mode
dégradé testé sans clés API.

## Limites assumées

Note de transparence : CheckSafe analyse les schémas d'ingénierie sociale et la
manipulation psychologique. Il ne remplace pas une analyse réseau approfondie ni
une vérification directe auprès des organismes officiels. Le résultat est une
aide à la décision, jamais une garantie.

## Licence

MIT
