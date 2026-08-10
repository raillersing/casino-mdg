# UX Premium — iGaming Madagascar Platform
## Design & Expérience Utilisateur Document

**Version:** 1.0  
**Date:** 2026-08-10  
**Public cible:** UX/UI Designer, Frontend Devs, Product Manager

---

## 1. Vision UX

### 1.1 Positionnement

> **« Une app qui charge en 2 secondes sur 3G, qui ne plante jamais en pleine partie, et qui donne envie de rester. Une expérience que les joueurs malgaches méritent — fluide, belle, et pensée pour eux. »**

### 1.2 Benchmark UX

| Plateforme | Ce qu'on copie | Ce qu'on évite |
|------------|---------------|----------------|
| **GGPoker** | Animations fluides, interface moderne | Trop d'options, complexité |
| **Betika** | Ultra-léger, rapide, simple | Design daté, peu immersif |
| **Linear** | Minimalisme, dark mode parfait | Pas gaming, trop corporate |
| **Duolingo** | Progression visible, encouragement | Gamification excessive |
| **Apple** | Polish, micro-interactions, haptic | Prix élevé, fermé |

### 1.3 Principes UX

1. **Mobile-first** : 97% du trafic. Desktop est optionnel.
2. **Dark mode** : Par défaut. Les cartes ressortent mieux sur fond sombre.
3. **Fluide** : 60fps minimum. Pas de lag, pas de freeze.
4. **Accessible** : Malgache, français, grandes touches, contrastes forts.
5. **Indulgent** : Si erreur → expliquer, pas punir. Si coupure → reconnexion facile.

---

## 2. Design System

### 2.1 Couleurs

```css
/* Primary — Bleu profond (confiance, calme) */
--color-primary-50: #E6F0FF;
--color-primary-100: #CCE0FF;
--color-primary-500: #0066CC;
--color-primary-600: #0052A3;
--color-primary-900: #001A33;

/* Secondary — Or (premium, succès) */
--color-gold-50: #FFF8E6;
--color-gold-100: #FFEBB3;
--color-gold-500: #D4A017;
--color-gold-600: #A87D0F;

/* Semantic */
--color-success: #22C55E;
--color-warning: #F59E0B;
--color-danger: #EF4444;
--color-info: #3B82F6;

/* Backgrounds */
--color-bg-primary: #0A0E1A;      /* Fond principal */
--color-bg-secondary: #111827;    /* Surfaces */
--color-bg-tertiary: #1F2937;     /* Cartes, inputs */
--color-bg-elevated: #374151;     /* Hover, focus */

/* Text */
--color-text-primary: #F9FAFB;
--color-text-secondary: #9CA3AF;
--color-text-tertiary: #6B7280;
```

### 2.2 Typographie

| Usage | Police | Taille | Poids |
|-------|--------|--------|-------|
| Titres | Inter | 24-32px | Bold (700) |
| Sous-titres | Inter | 18-20px | Semi-bold (600) |
| Corps | Inter | 14-16px | Regular (400) |
| Labels | Inter | 12px | Medium (500) |
| Cartes (valeur) | Roboto Mono | 14px | Bold | /* Chiffres alignés */
| Chiffres (montants) | Tabular Figures | — | — | /* Largeurs fixes */

**i18n** : Inter supporte parfaitement le latin (français) et l'ASCII (malgache). Pour le malgache avec accents spéciaux, fallback sur system fonts si nécessaire.

### 2.3 Espacements

```css
/* Base 4px */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-8: 48px;

/* Rayons */
--radius-sm: 4px;    /* Boutons, chips */
--radius-md: 8px;    /* Cartes, inputs */
--radius-lg: 12px;   /* Modales, panels */
--radius-xl: 16px;   /* Tables, containers */
--radius-full: 9999px; /* Avatars, badges */
```

### 2.4 Ombres et Glows

```css
/* Cartes tables */
--shadow-card: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
--shadow-elevated: 0 10px 15px -3px rgba(0, 0, 0, 0.6);

/* Glow actif (carte sélectionnée) */
--glow-active: 0 0 20px rgba(0, 102, 204, 0.4);
--glow-gold: 0 0 20px rgba(212, 160, 23, 0.4);

/* Glow alerte (timeout imminent) */
--glow-warning: 0 0 15px rgba(245, 158, 11, 0.5);
```

---

## 3. Composants clés

### 3.1 Carte à jouer (Card Component)

```
┌─────────────────────────────┐
│  ┌─────┐                    │
│  │  ♥   │  Valeur (A, K...)  │
│  │  A   │  Couleur rouge     │
│  │      │  ou noire          │
│  └─────┘                    │
│                             │
│        [Image centre]       │
│        (as de cœur)         │
│                             │
│                    ┌─────┐  │
│                    │  A  │  │
│                    │  ♥  │  │
│                    └─────┘  │
└─────────────────────────────┘

Specs :
├── Taille : 60×84px (mobile), 80×112px (tablette)
├── Coins : border-radius 8px
├── Fond : blanc cassé (#F9FAFB) ou dégradé subtil
├── Bordure : 1px solid rgba(0,0,0,0.1)
├── Ombre : --shadow-card
├── Transition : transform 0.2s ease, box-shadow 0.2s
├── Hover : scale(1.05), glow bleu
├── Sélectionné : glow gold, bordure 2px gold
└── Animation distribution : translateY(-20px) → 0, opacity 0 → 1
```

### 3.2 Table de jeu (Table Component)

```
┌─────────────────────────────────────────┐
│  ┌────┐                    ┌────┐       │
│  │ J3 │                    │ J4 │       │  ← Joueurs adverses
│  │🔴  │                    │🟢  │       │
│  └────┘                    └────┘       │
│                                         │
│         ┌─────────────────┐             │
│         │   ♠A ♥K ♦Q     │ ← Community │
│         │   POT: 12 500   │             │
│         └─────────────────┘             │
│                                         │
│  ┌────┐                    ┌────┐       │
│  │ J2 │                    │ ME │       │  ← Moi + adversaire
│  │🟡  │                    │🔵  │       │
│  └────┘                    └────┘       │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ [Fold]  [Check]  [Bet: 5 000]    ││  ← Actions
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘

Specs :
├── Fond : dégradé radial sombre (centre plus clair)
├── Tapis : texture subtile (optionnel)
├── Joueur actif : glow + timer circulaire (30s)
├── Joueur déconnecté : icône ⚡ gris + "Reconnecte..."
├── Pot : montant centré, gros chiffres, or
├── Timer : cercle SVG qui se vide (30s → 0)
└── Responsive : Portrait (mobile), Paysage (tablette)
```

### 3.3 Timer d'action

```
┌──────────┐
│ ◠◡◠◡◠◡  │  ← Cercle SVG animé
│   25s    │     stroke-dashoffset décrémente
│          │     couleur : vert → orange → rouge
└──────────┘

Transitions :
├── > 15s : Vert, stroke normal
├── 10-15s : Orange, stroke épais + pulse subtil
├── < 10s : Rouge, stroke très épais + vibration (haptic)
├── < 5s : Rouge clignotant + son "tick" (optionnel)
└── 0s : Action auto appliquée, son "timeout"
```

### 3.4 Lobby / Sélection table

```
┌─────────────────────────────────────────┐
│  🔍 Rechercher table...        [Filtres ▼]│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 🃏 Poker Texas Hold'em            ││
│  │ Tables actives: 12 | Joueurs: 45 ││
│  │ [Table Rapide] [Choisir table]   ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 🏠 Tables privées (3 amis en ligne)││
│  │ [Créer table] [Rejoindre club]     ││
│  └─────────────────────────────────────┘│
│                                         │
│  Tables rapides :                       │
│  ┌──────┐ ┌──────┐ ┌──────┐           │
│  │ 2/6  │ │ 4/6  │ │ 1/4  │           │
│  │ 500  │ │ 2K   │ │ 10K  │           │
│  │ ▶    │ │ ▶    │ │ ▶    │           │
│  └──────┘ └──────┘ └──────┘           │
│                                         │
│  [🏠 Accueil] [🎮 Jouer] [👤 Profil]   │
└─────────────────────────────────────────┘

Specs :
├── Pull-to-refresh sur liste tables
├── Skeleton screens pendant chargement
├── Tables pleines : badge "PLEIN" gris
├── Tables rapides : badge "RAPIDE" vert
└── Recommandation : "Pour ton niveau : Table 2K" (ELO-based)
```

### 3.5 Notifications

```
Types :
├── 🔔 Push : Tour de jeu, invitation, message
├── 📧 Email : Transaction, KYC, marketing
├── 💬 In-app : Toasts, badges, modales
└── 📱 SMS : Fallback push échoué (MG spécifique)

Design Toast :
┌─────────────────────────────────┐
│ 🎉 Victoire ! +2 500 jetons     │
│                                 │
│ Tu as battu MmeRaso en Belote   │
│              [Voir]  [OK]       │
└─────────────────────────────────┘

Specs :
├── Position : bottom-center (mobile), top-right (desktop)
├── Durée : 4s auto-dismiss, sauf si interaction
├── Swipe : dismiss sur mobile
└── File : max 3 toasts simultanés, empilement vertical
```

---

## 4. Animations et Micro-interactions

### 4.1 Distribution cartes

```css
@keyframes dealCard {
  0% {
    transform: translateY(-100px) rotateZ(10deg);
    opacity: 0;
  }
  60% {
    transform: translateY(10px) rotateZ(-2deg);
    opacity: 1;
  }
  100% {
    transform: translateY(0) rotateZ(0deg);
    opacity: 1;
  }
}

/* Séquence : delay entre chaque carte */
.card:nth-child(1) { animation: dealCard 0.4s ease-out 0s; }
.card:nth-child(2) { animation: dealCard 0.4s ease-out 0.15s; }
.card:nth-child(3) { animation: dealCard 0.4s ease-out 0.30s; }
```

### 4.2 Mise (jetons)

```
Animation :
├── Jetons apparaissent au-dessus de la main joueur
├── Translate vers le centre (pot)
├── Scale pulse à l'arrivée
└── Son "clack" (optionnel)

CSS :
@keyframes placeBet {
  0% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-20px) scale(1.1); }
  100% { transform: translateY(calc(-50vh + pot_y)) scale(1); }
}
```

### 4.3 Victoire (pot)

```
Animation :
├── Pot grossit (scale 1.2) + glow gold
├── Jetons se séparent vers joueur(s) gagnant(s)
├── Nombre "+12 500" apparaît, flotte vers le haut
├── Confetti subtil (particules SVG, 2s)
└── Son "win" (optionnel V1.5)
```

### 4.4 Loading states

```
Skeleton screens (pas de spinner rotatif) :

Avant chargement :
┌─────────────────────────────────┐
│ ████████████  (titre)           │
│ ████████      (sous-titre)      │
│                                 │
│ ┌──────────┐ ┌──────────┐       │
│ │ ████████ │ │ ████████ │       │  ← Rectangles
│ │ ████████ │ │ ████████ │       │    animés pulse
│ │ ████████ │ │ ████████ │       │
│ └──────────┘ └──────────┘       │
└─────────────────────────────────┘

Animation : opacity 0.3 → 0.7 → 0.3 (1.5s loop)
Couleur : --color-bg-tertiary
```

### 4.5 Transitions de page

```css
/* React Router transitions */
.page-enter {
  opacity: 0;
  transform: translateX(20px);
}
.page-enter-active {
  opacity: 1;
  transform: translateX(0);
  transition: opacity 200ms, transform 200ms;
}
.page-exit {
  opacity: 1;
}
.page-exit-active {
  opacity: 0;
  transition: opacity 150ms;
}
```

---

## 5. Accessibilité

### 5.1 Contraste

| Élément | Ratio minimum | Exemple |
|---------|--------------|---------|
| Texte principal / fond | 7:1 | Blanc sur #0A0E1A ✓ |
| Texte secondaire / fond | 4.5:1 | #9CA3AF sur #0A0E1A ✓ |
| Bouton primaire / fond | 4.5:1 | Blanc sur #0066CC ✓ |
| Carte (valeur) / fond carte | 7:1 | Noir sur blanc ✓ |

### 5.2 Touch targets

```
Minimum 44×44dp (iOS) / 48×48dp (Android)

┌──────────────┐
│              │  48dp
│   [Fold]     │
│              │
└──────────────┘
     120dp

Espacement entre boutons : min 8dp
```

### 5.3 Réduction mouvement

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 5.4 Screen readers

```html
<!-- Bon -->
<button aria-label="Miser 5000 jetons">
  <span aria-hidden="true">Bet 5000</span>
</button>

<!-- Carte pour screen reader -->
<div role="img" aria-label="As de cœur">
  <!-- Visuel carte -->
</div>

<!-- Timer -->
<div aria-live="polite" aria-atomic="true">
  25 secondes restantes
</div>
```

---

## 6. Responsive Design

### 6.1 Breakpoints

| Nom | Largeur | Usage |
|-----|---------|-------|
| Mobile S | < 360px | Feature phones rares |
| Mobile M | 360-414px | iPhone SE, Android standard |
| Mobile L | 414-480px | iPhone Plus, grands Android |
| Tablet | 768-1024px | iPad, tablettes Android |
| Desktop | > 1024px | Desktop (10% trafic) |

### 6.2 Layouts par écran

```
Mobile (portrait, 99% usage)
┌─────────────────┐
│ Header (logo)   │
├─────────────────┤
│                 │
│   Table centré  │
│   (pleine largeur)│
│                 │
├─────────────────┤
│ Actions (bottom) │
├─────────────────┤
│ Nav (bottom)    │
└─────────────────┘

Tablet (paysage, optionnel)
┌────────┬────────┐
│ Lobby  │ Table  │
│ gauche │ droite │
│ 30%    │ 70%    │
└────────┴────────┘

Desktop (optionnel)
┌────────┬────────┬────────┐
│ Lobby  │ Table  │ Chat   │
│ gauche │ centre │ droite │
│ 20%    │ 60%    │ 20%    │
└────────┴────────┴────────┘
```

---

## 7. Sons et Feedback haptic

### 7.1 Sons (optionnel V1.5)

| Événement | Son | Volume | Optionnel |
|-----------|-----|--------|-----------|
| Distribution carte | "shhh" (carte sur tapis) | 30% | Oui |
| Mise jetons | "clack" | 40% | Oui |
| Victoire | "ding-ding" court | 50% | Oui |
| Timeout < 5s | "tick" (subtil) | 30% | Oui |
| Erreur | "bip" bas | 20% | Non (important) |

**Gestion** : Mute global, volumes individuels, option "Sons d'alerte uniquement".

### 7.2 Haptic (mobile)

| Événement | Pattern | Optionnel |
|-----------|---------|-----------|
| Action validée | Light impact | Non |
| Erreur (pas assez de jetons) | Error | Non |
| Timeout imminent | Warning | Non |
| Victoire | Success | Oui |
| Long press | Heavy impact | Non |

---

## 8. Performance cibles

| Métrique | Objectif | Comment |
|----------|----------|---------|
| FCP (First Contentful Paint) | < 1.5s | Optimisation critique |
| LCP (Largest Contentful Paint) | < 2.5s | Table visible vite |
| TTI (Time to Interactive) | < 3.5s | Actions cliquables |
| CLS (Cumulative Layout Shift) | < 0.1 | Pas de saut visuel |
| FID (First Input Delay) | < 100ms | Réponse instantanée |
| Bundle JS initial | < 200KB | Gzip, lazy load |
| Images | < 50KB/carte | WebP, spritesheet |
| Animations | 60fps | GPU compositing |

### 8.1 Optimisations

```javascript
// Lazy loading routes
const PokerTable = lazy(() => import('./pages/PokerTable'));
const BeloteTable = lazy(() => import('./pages/BeloteTable'));

// Spritesheet cartes (1 image vs 52 requêtes)
// Cards sprite : 13×4 = 52 cartes en 1 image WebP

// Prefetch table courante
const prefetchNextAssets = () => {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = '/assets/table-sounds.webm';
  document.head.appendChild(link);
};

// Service Worker cache
// Cache-first pour assets statiques
// Network-first pour API
```

---

## 9. Dark Mode

### 9.1 Implémentation

```css
/* Par défaut : dark */
:root {
  --color-bg-primary: #0A0E1A;
  --color-bg-secondary: #111827;
  /* ... etc */
}

/* Light mode (optionnel V2) */
[data-theme="light"] {
  --color-bg-primary: #F9FAFB;
  --color-bg-secondary: #FFFFFF;
  /* Inverser contrastes */
}

/* Auto (prefers-color-scheme) */
@media (prefers-color-scheme: light) {
  [data-theme="auto"] { /* light variables */ }
}
```

**Priorité** : Dark mode obligatoire MVP. Light mode optionnel V2 (très peu demandé en gaming).

---

## 10. Assets et Ressources

### 10.1 Cartes à jouer

| Format | Taille | Usage |
|--------|--------|-------|
| WebP | 52 cartes × ~5KB = 260KB | Affichage standard |
| SVG | ~2KB/carte | Scalable, animations |
| Spritesheet | 1 image ~100KB | Toutes cartes en 1 requête |

**Styles cartes** :
- Classique : Bicyclé standard
- Premium (V2) : Design exclusif Casino MDG
- Thème régional (V3) : Motifs malgaches

### 10.2 Avatars

| Type | Disponibilité | Prix |
|------|----------------|------|
| Défaut | Gratuit | Silhouette |
| Emoji style | Gratuit | 😎 🦁 🌴 |
| Illustrés | Jetons / réel | Style cartoon |
| Premium | Réel uniquement | Animés, effets |

### 10.3 Sons

| Format | Raison |
|--------|--------|
| WebM (Opus) | Léger, bonne qualité |
| Fallback MP3 | Compatibilité |

---

## 11. Checklist UX MVP

### Avant beta
- [ ] Dark mode natif sur tous les écrans
- [ ] Cartes animées (distribution, mise)
- [ ] Timer visuel (cercle SVG)
- [ ] Skeleton screens (pas de spinners vides)
- [ ] Toast notifications (succès, erreur, info)
- [ ] Bottom navigation (3 items max)
- [ ] Pull-to-refresh sur listes
- [ ] Swipe actions (dismiss notif, etc.)
- [ ] Touch targets >= 48dp
- [ ] Texte lisible (contrastes vérifiés)

### Avant production
- [ ] 60fps animations
- [ ] FCP < 1.5s
- [ ] TTI < 3.5s
- [ ] Bundle < 200KB initial
- [ ] Haptic feedback (actions critiques)
- [ ] Sons optionnels (alertes)
- [ ] Réduction mouvement (accessibilité)
- [ ] Test sur Android bas de gamme (Tecno, Itel)
- [ ] Test sur 3G (throttling Chrome DevTools)
- [ ] Test coupure réseau (grace period visible)
