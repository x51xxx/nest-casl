import { AnyAbility, Subject } from '@casl/ability';
import { rulesToAST } from '@casl/ability/extra';
import { Condition, MongoQuery } from '@ucast/mongo2js';
import { createSqlInterpreter, allInterpreters, pg } from '@ucast/sql';
import { AnyMongoAbility } from '@casl/ability';
import { rulesToQuery } from '@casl/ability/extra';

export type SqlConditions = [string, unknown[], string[]];

function convertToMongoQuery(rule: AnyMongoAbility['rules'][number]) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const conditions = rule.conditions!;
  return rule.inverted ? { $nor: [conditions] } : conditions;
}

export class ConditionsProxy {
  constructor(
    private abilities: AnyAbility,
    private action: string,
    private subject: Subject,
  ) {}

  public toAst(): Condition | null {
    return rulesToAST(this.abilities, this.action, this.subject);
  }

  public toSql(): SqlConditions | undefined {
    const ast = this.toAst();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (ast === null || !Array.from(ast.value as any).length) return undefined;
    const interpret = createSqlInterpreter(allInterpreters);
    return interpret(ast, {
      ...pg,
      joinRelation: this.joinRelation,
    });
  }

  public joinRelation(): boolean {
    return false;
  }

  public toMongo(): MongoQuery | undefined {
    if (!this.getRules()) return undefined;
    return rulesToQuery(this.abilities, this.action, this.subject, convertToMongoQuery) || undefined;
  }

  public get(): MongoQuery[] {
    return this.getRules().map((r) => r.conditions);
  }

  /**
   * Returns the first matching non-inverted rule's conditions as a typed filter object.
   * Useful for passing conditions directly to TypeORM FindOptionsWhere, Prisma where, etc.
   * Returns undefined when no conditions exist (e.g., unrestricted access).
   */
  public toFilter<T = Record<string, unknown>>(): T | undefined {
    const rules = this.getRules();
    if (!rules.length) return undefined;
    const withConditions = rules.filter((r) => r.conditions && !r.inverted);
    if (!withConditions.length) return undefined;
    return withConditions[0].conditions as T;
  }

  /**
   * Merges all non-inverted rules into a single query object using CASL's rulesToQuery.
   * Returns the merged conditions with $or/$in operators preserved.
   * Useful as input for ORM-specific translators.
   *
   * Example:
   *   can('read', Post, { accountId: 1 })
   *   can('read', Post, { public: true })
   *   → { $or: [{ accountId: 1 }, { public: true }] }
   */
  public toQuery<T = Record<string, unknown>>(): T | undefined {
    const query = rulesToQuery(this.abilities, this.action, this.subject, convertToMongoQuery);
    return (query || undefined) as T | undefined;
  }

  /**
   * Converts CASL conditions to an ORM-friendly where clause.
   * $or is flattened to an array of plain objects (TypeORM/Prisma OR pattern).
   * $in arrays are preserved as-is. Consumers wrap them with their ORM's In() operator.
   *
   * Example:
   *   can('read', Post, { accountId: 1 })
   *   can('read', Post, { status: { $in: ['a', 'b'] } })
   *   → [{ accountId: 1 }, { status: { $in: ['a', 'b'] } }]
   *
   * For TypeORM, consumer wraps $in:
   *   filter.map(w => transformIn(w))  // { $in: [...] } → In([...])
   */
  public toWhere<T = Record<string, unknown>>(): T | T[] | undefined {
    const query = this.toQuery();
    if (!query) return undefined;
    return this.flattenOr(query) as T | T[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private flattenOr(query: any): any {
    if (!query || typeof query !== 'object') return query;
    if ('$or' in query) {
      const conditions = query.$or.map((c: unknown) => this.flattenOr(c));
      return conditions.length === 1 ? conditions[0] : conditions;
    }
    return query;
  }

  public getRules() {
    return this.abilities.rulesFor(this.action, this.subject);
  }
}
