import { createDeleteUserFromPayload, createSyncUserToPayload } from './sources.js';
export function createDatabaseHooks({ config }) {
    const syncUserToPayload = createSyncUserToPayload(config);
    const deleteUserFromPayload = createDeleteUserFromPayload(config);
    return {
        user: {
            create: {
                // After the BA user exists, sync to Payload. On failure, enqueue in memory.
                after: async (user)=>{
                    // push BA-induced ensure to the **front** of the queue
                    await syncUserToPayload(user);
                }
            },
            // TODO: possibly offer "update"
            delete: {
                after: async (user)=>{
                    await deleteUserFromPayload(user.id);
                }
            }
        }
    };
}

//# sourceMappingURL=databaseHooks.js.map