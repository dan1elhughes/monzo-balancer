import { DatabaseSync, SQLInputValue } from "node:sqlite";

export function createTestDatabase(schema: string) {
	const database = new DatabaseSync(":memory:");
	database.exec(schema);
	const db = {
		prepare(sql: string) {
			const statement = database.prepare(sql);
			let values: SQLInputValue[] = [];
			return {
				bind(...bound: SQLInputValue[]) {
					values = bound;
					return this;
				},
				async run() {
					const result = statement.run(...values);
					return { success: true, meta: { changes: Number(result.changes) } };
				},
				async first<T>() {
					return (statement.get(...values) as T | undefined) ?? null;
				},
				async all<T>() {
					return { success: true, results: statement.all(...values) as T[] };
				},
			};
		},
	} as unknown as D1Database;
	return { db, database };
}
