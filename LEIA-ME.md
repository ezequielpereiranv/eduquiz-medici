# EduQuiz Médici v2.7 — MongoDB

Versão preparada para Render Free usando MongoDB para persistir partidas, resultados e ranking.

## Banco
- As 100 questões permanecem em `questions.json`.
- O MongoDB armazena somente partidas/resultados/ranking.
- Banco lógico padrão: `eduquiz_medici`.
- Coleção: `partidas`.
- Não usa SQLite e não precisa de Persistent Disk no Render.

## Variáveis de ambiente
- `MONGODB_URI` — string de conexão do MongoDB/Atlas (obrigatória no Render para persistência).
- `MONGODB_DB` — opcional; padrão `eduquiz_medici`.

## Render
Build Command: `npm install`
Start Command: `npm start`
Health Check Path: `/api/health`

Após configurar `MONGODB_URI`, acesse `/api/health`. O retorno deve indicar `"storage":"mongodb"`.
