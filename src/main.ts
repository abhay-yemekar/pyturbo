import { Application } from './ide/application';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Application root missing.');
const app = new Application(root);
app.start().catch((error: unknown) => {
  const message = document.createElement('p');
  message.className = 'startup-error';
  message.textContent = `PyTurbo could not start: ${String(error)}`;
  root.append(message);
});
