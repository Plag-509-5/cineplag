# CinéPlag

Interface Next.js de découverte et de lecture de films et séries, en français.

## API de catalogue et de lecture

Le catalogue, la recherche, les fiches, les épisodes, la résolution des flux, les sous-titres et les téléchargements utilisent le backend MovieBox documenté sur `http://169.58.175.210:3029/docs`. Les appels d’API passent par le serveur Next.js ; le lecteur charge ensuite l’URL média fournie par MovieBox.

La base utilisée par défaut est `http://169.58.175.210:3029` (sans `/docs`). Elle peut être remplacée par la variable d’environnement `MOVIEBOX_API_BASE_URL` si nécessaire.

Les routes Next.js `/api/auth` et `/api/library` restent les services locaux de l’application pour les comptes et les collections. Elles ne sont pas des fournisseurs externes de catalogue ou de lecture.
