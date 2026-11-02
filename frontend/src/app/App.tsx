import { WorkspaceProvider } from '@/app/providers/WorkspaceProvider';
import { AppShell } from '@/components/layout/AppShell';

export default function App() {
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  );
}
