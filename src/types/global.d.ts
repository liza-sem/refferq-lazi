declare namespace NodeJs {
    interface ProcessEnv {
        JWT_SECRET: string;
        DATABASE_URL: string;
        PLUNK_SECRET_KEY: string;
        PLUNK_API_URL?: string;
        PLUNK_FROM_EMAIL?: string;
        PLUNK_FROM_NAME?: string;
        NEXT_PUBLIC_APP_URL: string;
    }
}

declare var process: {
    env: NodeJs.ProcessEnv;
};
