import { createApp } from './app.js';
import { env } from './utils/env.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`);
});