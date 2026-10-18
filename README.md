# CinéPlag

Interface Next.js de découverte et de lecture de films et séries, en français.

## API de catalogue et de lecture

Le catalogue, la recherche, les fiches, les épisodes, la résolution des flux, les sous-titres et les téléchargements utilisent le backend MovieBox documenté sur `http://169.58.175.210:3029/docs`. Les appels d’API passent par le serveur Next.js ; le lecteur charge ensuite l’URL média fournie par MovieBox.

La base utilisée par défaut est `http://169.58.175.210:3029` (sans `/docs`). Elle peut être remplacée par `MOVIEBOX_API_BASE_URL`.

## Base MongoDB

Les comptes, sessions, collections, avis et progressions de lecture sont stockés dans MongoDB avec le pilote officiel Node.js. Configure ces variables dans l’environnement du serveur (par exemple dans les variables de démarrage Pterodactyl) :

- `MONGODB_URI` : URI de connexion MongoDB Atlas ou autre serveur MongoDB.
- `MONGODB_DB` : nom de la base (facultatif, valeur par défaut `cineplag`).

Ne mets jamais l’URI avec son mot de passe dans Git. Les index nécessaires sont créés automatiquement à la première connexion. Les routes `/api/auth` et `/api/library` restent les services locaux de l’application ; elles ne constituent pas un fournisseur externe de catalogue ou de lecture.
