export type AegisPolicy = {
    $schema?: string;
    version?: string;
    actions?: {
        read_file?: {
            default?: string;
            deny_patterns?: string[];
        };
        edit_file?: {
            default?: string;
            allow_patterns?: string[];
            deny_patterns?: string[];
        };
        run_shell?: {
            default?: string;
            high_risk_patterns?: string[];
        };
        fetch_domain?: {
            default?: string;
            allow_list?: string[];
        };
        use_secret?: {
            default?: string;
            allowed_via?: string;
        };
    };
    high_risk_patterns?: string[];
    routing?: {
        host_passthrough?: string[];
        sandbox_required?: string[];
    };
    degraded_mode?: {
        allow_host_passthrough?: boolean;
        block_sandbox_required?: boolean;
        warn_on_degraded?: boolean;
    };
    tools?: {
        enabled?: string[];
        auto_update?: boolean;
    };
};
export type PolicyDecision = {
    action: string;
    effect: "allow" | "warn" | "log";
    reason: string;
    pattern?: string;
};
export declare function validatePolicy(raw: unknown): {
    policy: AegisPolicy;
    warnings: string[];
};
