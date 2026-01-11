import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite';
export declare function up({ db, payload, req }: MigrateUpArgs): Promise<void>;
export declare function down({ db, payload, req }: MigrateDownArgs): Promise<void>;
