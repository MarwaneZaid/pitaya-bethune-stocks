# Pitaya Béthune – Stocks

Application web statique (PWA) de suivi quotidien des écarts de stock pour le restaurant **Pitaya LILLE - BETHUNE**.

L'application compare les stocks réels (inventaire du soir) aux stocks théoriques issus d'Inpulse et affiche :
- **Alerte du matin** : liste des produits à recompter avec écarts > 5 %
- **Produits** : graphiques et historique jour par jour pour chaque produit
- **Suivi du plan d'action** : diagnostics et cumuls depuis le 02/10/2026

## Protection par code d'accès

L'application est protégée par un code d'accès (PIN) configurable côté client. Par défaut, le code est **2026**.

**⚠️ Attention** : il s'agit d'une protection légère uniquement côté client. Elle empêche l'accès casual mais ne constitue pas une sécurité forte. Le code est stocké dans `assets/app.js` (constante `ACCESS_CODE`) et mémorisé dans le `localStorage` du navigateur après saisie.

Pour changer le code, modifiez la ligne suivante dans `assets/app.js` :
```javascript
var ACCESS_CODE = "2026";
```

## Mettre à jour les données

Les données sources proviennent de l'export **Analyse des stocks passés** d'Inpulse (CSV : `produit,date,stock_theorique_kg,stock_reel_kg`).

**⚠️ Important** : malgré le nom des colonnes, les valeurs du CSV sont en **EUROS** (le théorique est arrondi à l'euro). Le script `build_data.py` les convertit en kilogrammes en utilisant les prix au kg définis dans le script.

### Procédure

1. Ajouter les nouvelles lignes (nouveaux jours) au fichier CSV :
   ```
   data/source/stocks_quotidiens_bethune.csv
   ```
   Format : `produit,date,stock_theorique_kg,stock_reel_kg` (valeurs en €, `-` pour « non compté »)

2. Régénérer les fichiers JSON :
   ```bash
   python3 scripts/build_data.py
   ```
   Cela génère `data/stocks.json` (historique complet) et `data/today.json` (dernier jour = alerte du matin).

3. Commiter et pousser les changements :
   ```bash
   git add data/
   git commit -m "Mise à jour stocks au JJ/MM/AAAA"
   git push
   ```

4. Le déploiement sur Vercel se fait automatiquement. Le service worker utilise la stratégie « réseau d'abord », donc les nouvelles données s'affichent sans vider le cache.

### Configuration

Les paramètres se trouvent en tête de `scripts/build_data.py` :
- Prix au kg par produit (pour conversion € → kg)
- Unités de comptage (poches, sachets, sacs, kg)
- Date de début du plan d'action (02/10/2026)
- Seuil d'alerte (5 %)

## Test en local

Lancer un serveur HTTP simple :
```bash
python3 -m http.server 8765
```
Puis ouvrir http://localhost:8765/

## Déploiement sur Vercel

L'application est configurée pour un déploiement statique sur Vercel.

### Configuration Vercel

Le fichier `vercel.json` est déjà configuré :
- Framework : **Other**
- Commande de build : aucune
- Dossier de sortie : `.` (racine du projet)
- Headers spéciaux pour le service worker et les données

### Déploiement connecté à Origin

1. Créer un compte Vercel (si ce n'est pas déjà fait) : https://vercel.com

2. Connecter le dépôt Origin :
   - Depuis le dashboard Vercel → **Add New… → Project**
   - Importer le dépôt Origin en utilisant l'intégration Git
   - Choisir ce dépôt

3. Configuration du projet :
   - **Framework Preset** : Other
   - **Build Command** : laisser vide ou `#` (pas de build)
   - **Output Directory** : `.` (laisser vide par défaut)
   - **Install Command** : laisser vide

4. Déployer :
   - Cliquer sur **Deploy**
   - Le déploiement se fait automatiquement à chaque push sur la branche principale

### Déploiement manuel (CLI)

Si vous préférez utiliser la CLI Vercel :
```bash
npm install -g vercel
vercel login
vercel deploy --prod
```

## Installer l'application sur un téléphone

L'application est une PWA (Progressive Web App) installable sur l'écran d'accueil.

### Sur iPhone / iPad (Safari)

1. Ouvrir l'application dans Safari
2. Saisir le code d'accès
3. Toucher le bouton **Partager** (icône carré avec flèche vers le haut)
4. Sélectionner **Sur l'écran d'accueil**
5. Confirmer

### Sur Android (Chrome)

1. Ouvrir l'application dans Chrome
2. Saisir le code d'accès
3. Toucher le menu (3 points verticaux)
4. Sélectionner **Installer l'application** (ou **Ajouter à l'écran d'accueil**)
5. Confirmer

Une fois installée, l'application fonctionne hors ligne (les dernières données consultées restent disponibles).

## Structure du projet

```
/
├── index.html                      # Point d'entrée de l'application
├── manifest.json                   # Manifeste PWA
├── sw.js                           # Service worker (cache hors ligne)
├── assets/
│   ├── app.css                     # Styles de l'application
│   ├── app.js                      # Logique de l'application (PIN + app)
│   └── vendor/
│       └── chart.umd.min.js        # Chart.js 4.5.1 (MIT)
├── icons/                          # Icônes PWA (192×192, 512×512, etc.)
├── data/
│   ├── source/
│   │   └── stocks_quotidiens_bethune.csv  # CSV source Inpulse
│   ├── stocks.json                 # Données complètes (généré)
│   └── today.json                  # Alerte du jour (généré)
├── scripts/
│   └── build_data.py               # Script de génération des JSON
├── vercel.json                     # Configuration Vercel
├── netlify.toml                    # Configuration Netlify (alternative)
└── README.md                       # Ce fichier
```

## Technologies

- HTML5, CSS3, JavaScript vanilla (ES5, pas de build)
- Chart.js 4.5.1 (graphiques)
- Service Worker (cache hors ligne, stratégie réseau d'abord)
- Python 3 (scripts de génération des données)

## Notes techniques

- **HTTPS obligatoire** pour l'installation PWA et le service worker (fourni automatiquement par Vercel/Netlify)
- Les fichiers `.vercelignore` excluent `scripts/` et `uploads/` du déploiement
- Le service worker met en cache l'application mais utilise toujours le réseau en priorité pour les données
- Les headers `Cache-Control: no-cache` sont appliqués sur `sw.js` et `data/` pour forcer la mise à jour

## Licence

Chart.js est distribué sous licence MIT.
