import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import tournamentRoutes from './routes/tournamentRoutes.ts';
import matchRoutes from './routes/matchRoutes.ts';
import schoolRoutes from './routes/schoolRoutes.ts';
import teamRoutes from './routes/teamRoutes.ts';
import pastTournamentRoutes from './routes/pastTournamentRoutes.ts';
import publicRoutes from './routes/publicRoutes.ts';
import authRoutes from './routes/authRoutes.ts';
import testRoutes from './routes/testRoutes.ts';
import participantAdminRoutes from './routes/participantAdminRoutes.ts';
import participantPortalRoutes from './routes/participantPortalRoutes.ts';
import devTempRoutes from './dev/temp-logins/devTempRoutes.ts'; // TEMP-LOGIN: remove later
import { optionalAuth } from './middlewares/authMiddleware.ts';
import { errorHandler } from './middlewares/validationMiddleware.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createApp(hmrPort?: number) {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(optionalAuth);

  // API Router
  const apiRouter = express.Router();
  apiRouter.use('/tournaments', tournamentRoutes);
  apiRouter.use('/matches', matchRoutes);
  apiRouter.use('/schools', schoolRoutes);
  apiRouter.use('/teams', teamRoutes);
  apiRouter.use('/past-tournaments', pastTournamentRoutes);
  apiRouter.use('/public', publicRoutes);
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/tests', testRoutes);
  apiRouter.use('/admin/participants', participantAdminRoutes);
  apiRouter.use('/my', participantPortalRoutes);
  apiRouter.use('/school', participantPortalRoutes);
  if (process.env.NODE_ENV !== 'production') {
    apiRouter.use('/dev', devTempRoutes); // TEMP-LOGIN: remove later
  }

  // Centralized API error handling
  apiRouter.use(errorHandler);

  app.use('/api', apiRouter);

  // Frontend integration: Vite middleware in development, static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, '..', 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      // Always load the project's vite.config.ts regardless of the process cwd,
      // so the Tailwind + React plugins always load (e.g. when launched from client/).
      configFile: path.resolve(__dirname, '..', 'vite.config.ts'),
      root: path.resolve(__dirname, '..', 'client'),
      server: {
        middlewareMode: true,
        // One HMR websocket port per server instance, so multiple dev servers can coexist
        hmr: process.env.DISABLE_HMR === 'true' ? false : (hmrPort ? { port: hmrPort } : true),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}
