# Contrôles administratifs des joueurs et du matchmaking

## Comptes joueurs

POST /api/v1/backoffice/players/{id}/status/ exige un super-administrateur actif, un dispositif TOTP confirmé, l'action suspend/reactivate, un booléen expected_active et une justification de 12 à 255 caractères. La modification est transactionnelle et auditée. L'incrémentation de token_version invalide les anciens JWT d'accès et de renouvellement, y compris après réactivation. Les comptes staff ne sont pas des cibles autorisées.

La suspension est refusée lorsqu'un bankroll de table réservé ou actif existe : une procédure de revue financière est alors nécessaire. L'API ne démontre pas la déconnexion des connexions WebSocket déjà établies dans le moteur de jeu.

## Matchmaking

GET /api/v1/backoffice/games/matchmaking/diagnostics/ expose les tickets périmés et les totaux de la base, sous permission games.read. Il ne vérifie pas la santé du moteur temps réel.

POST /api/v1/backoffice/games/matchmaking/tickets/{uuid}/cancel/ exige un super-administrateur avec TOTP, la version expected_updated_at du ticket et une justification enregistrée. Seul un ticket encore en file, non associé, et déjà périmé peut être annulé. Aucune table, mise ou transaction financière n'est modifiée.

## Vérifications indispensables avant activation

Effectuer la migration accounts/0005, rejouer la CI et les tests d'intégration avec une véritable base PostgreSQL. Vérifier la propagation des révocations sur toutes les instances backend, la déconnexion du moteur WebSocket, la procédure d'incident, les contrôles de staging et le rollback. Aucun feu vert pour des fonds réels n'est implicite.
