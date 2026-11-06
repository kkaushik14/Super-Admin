export type Audit = {
  id: string;
  at: string;
  actor: string;
  projectId: string;
  action: string;
  target: string;
  reason: string;
  status: string;
};
