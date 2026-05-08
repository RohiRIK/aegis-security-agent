export type DockerState = "running" | "binary_missing" | "daemon_unavailable" | "container_absent" | "container_stopped" | "start_failure";
export declare function detectDockerState(): Promise<DockerState>;
export declare function isDockerAvailable(state: DockerState): boolean;
export declare function isDegraded(state: DockerState): boolean;
export declare function formatDockerWarning(state: DockerState): string;
