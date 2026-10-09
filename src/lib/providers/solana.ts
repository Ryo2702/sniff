import { z } from "zod";
import {
  addr,
  entity,
  entityId,
  percent,
  units,
  type Snapshot,
  type Entity,
  type Finding,
} from "../model";
import { rpc, step, type RpcName, type Update } from "./client";
const uint = z.string().regex(/^\d+$/);
const account = z.object({
  lamports: z.number().int().nonnegative(),
  owner: z.string(),
  executable: z.boolean(),
  data: z.union([
    z.array(z.string()),
    z.object({
      parsed: z.object({
        type: z.string(),
        info: z.record(z.string(), z.unknown()),
      }),
    }),
  ]),
});
const ix = z.object({
  program: z.string().optional(),
  parsed: z
    .object({ type: z.string(), info: z.record(z.string(), z.unknown()) })
    .optional(),
});
const tokenBalance = z.object({
  accountIndex: z.number(),
  mint: z.string(),
  owner: z.string().optional(),
  uiTokenAmount: z.object({
    amount: uint,
    decimals: z.number().int().min(0).max(255),
  }),
});
const tokenAccountInfo = z.object({
  mint: z.string(),
  tokenAmount: z.object({
    amount: uint,
    decimals: z.number().int().min(0).max(255),
  }),
});
const tokenAccounts = z.object({
  value: z.array(z.object({ pubkey: z.string(), account })),
});
const tokenPrograms = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
] as const;
const pumpFunProgram = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const transactionSchema = z.object({
  slot: z.number(),
  blockTime: z.number().nullable(),
  meta: z
    .object({
      err: z.unknown(),
      preTokenBalances: z.array(tokenBalance).nullish(),
      postTokenBalances: z.array(tokenBalance).nullish(),
      innerInstructions: z
        .array(z.object({ index: z.number(), instructions: z.array(ix) }))
        .nullish(),
    })
    .nullable(),
  transaction: z.object({
    message: z.object({
      accountKeys: z.array(
        z.object({ pubkey: z.string(), signer: z.boolean() }),
      ),
      instructions: z.array(ix),
    }),
  }),
});
export type ParsedTransaction = z.infer<typeof transactionSchema>;
const source = (r: Snapshot, url: string, slot?: number) => ({
  provider: "Solana RPC",
  url,
  at: r.at,
  strength: "onchain" as const,
  slot,
});
const accountLink = (s: string) => `https://solscan.io/account/${s}`;
export function addEntity(
  r: Snapshot,
  value: string,
  kind: Entity["kind"] = "wallet",
  label = value,
) {
  const e = entity(addr(value), kind, label, true);
  if (!r.entities.some((x) => x.id === e.id)) r.entities.push(e);
  return e;
}
function addFinding(r: Snapshot, f: Finding) {
  if (!r.findings.some((x) => x.id === f.id)) r.findings.push(f);
}
export function parseTransaction(
  r: Snapshot,
  t: ParsedTransaction,
  signature: string,
) {
  const src = source(r, `https://solscan.io/tx/${signature}`, t.slot);
  const te = entity(
    { kind: "transaction", value: signature },
    "transaction",
    signature,
    true,
  );
  r.entities.push(te);
  addFinding(r, {
    id: `tx:${signature}`,
    title:
      t.meta?.err === null
        ? "Confirmed transaction"
        : "Failed transaction / metadata unavailable",
    description: `Slot ${t.slot}. ${t.meta?.err === null ? "Successful execution." : "No successful transfer relationships inferred."}`,
    entityIds: [te.id],
    source: src,
    category: "identity",
  });
  if (!t.meta || t.meta.err !== null) return;
  const balances = new Map<string, z.infer<typeof tokenBalance>>();
  for (const b of [
    ...(t.meta.preTokenBalances ?? []),
    ...(t.meta.postTokenBalances ?? []),
  ]) {
    const key = t.transaction.message.accountKeys[b.accountIndex]?.pubkey;
    if (key) balances.set(key, b);
  }
  const instructions = [
    ...t.transaction.message.instructions,
    ...(t.meta.innerInstructions ?? []).flatMap((i) => i.instructions),
  ];
  for (const [index, instruction] of instructions.entries()) {
    const p = instruction.parsed;
    if (!p) continue;
    const i = p.info;
    if (
      ["initializeMint", "initializeMint2"].includes(p.type) &&
      typeof i.mint === "string"
    ) {
      if (i.mint === r.target.value) {
        const signer = t.transaction.message.accountKeys.find((key) => key.signer)?.pubkey;
        const deployer = signer ? addEntity(r, signer, "wallet", "Observed initializer signer") : undefined;
        const findingId = `mint-init:${signature}:${index}`;
        addFinding(r, {
          id: findingId,
          title: "Mint initialization observed",
          description:
            `${signer ? `Signer ${signer} initialized this mint. ` : "This transaction initialized the mint. "}A signer or fee payer is not automatically the project deployer or beneficial owner.`,
          entityIds: [r.root.id, te.id, ...(deployer ? [deployer.id] : [])],
          source: src,
          category: "deployment",
        });
        if (deployer)
          r.relationships.push({
            id: `deployer:${findingId}`,
            from: deployer.id,
            to: r.root.id,
            type: "initialization",
            findingId,
          });
      } else if (
        t.transaction.message.accountKeys.some(
          (k) => k.signer && k.pubkey === r.target.value,
        )
      ) {
        const mint = addEntity(r, i.mint, "token");
        const id = `init:${signature}:${index}`;
        addFinding(r, {
          id,
          title: "Mint initialization signed",
          description:
            "The investigated address signed a transaction that initialized this mint. This does not establish sole deployment or beneficial ownership.",
          entityIds: [r.root.id, mint.id],
          source: src,
          category: "deployment",
        });
        r.relationships.push({
          id,
          from: r.root.id,
          to: mint.id,
          type: "initialization",
          findingId: id,
        });
      }
    }
    if (
      !["transfer", "transferChecked"].includes(p.type) ||
      typeof i.source !== "string" ||
      typeof i.destination !== "string"
    )
      continue;
    const native = instruction.program === "system";
    if (
      !native &&
      !["spl-token", "spl-token-2022"].includes(instruction.program ?? "")
    )
      continue;
    const fromBalance = balances.get(i.source),
      toBalance = balances.get(i.destination);
    const from = native ? i.source : (fromBalance?.owner ?? i.source);
    const to = native ? i.destination : (toBalance?.owner ?? i.destination);
    const relevant =
      r.target.kind === "transaction" ||
      [
        from,
        to,
        i.source,
        i.destination,
        i.authority,
        i.mint,
        fromBalance?.mint,
        toBalance?.mint,
      ].includes(r.target.value);
    if (!relevant) continue;
    const tokenAmount = z
      .object({ amount: uint, decimals: z.number().int().min(0).max(255) })
      .safeParse(i.tokenAmount);
    const raw =
      native &&
      typeof i.lamports === "number" &&
      Number.isSafeInteger(i.lamports)
        ? String(i.lamports)
        : tokenAmount.success
          ? tokenAmount.data.amount
          : typeof i.amount === "string" && /^\d+$/.test(i.amount)
            ? i.amount
            : undefined;
    const decimals = native
      ? 9
      : tokenAmount.success
        ? tokenAmount.data.decimals
        : (fromBalance?.uiTokenAmount.decimals ??
          toBalance?.uiTokenAmount.decimals);
    if (raw === undefined || decimals === undefined) {
      r.warnings.push(
        "A transfer omitted an exact amount or decimals; it was not included in amount analysis.",
      );
      continue;
    }
    const mint = native
      ? undefined
      : typeof i.mint === "string"
        ? i.mint
        : (fromBalance?.mint ?? toBalance?.mint);
    const fe = addEntity(
        r,
        from,
        native || fromBalance?.owner ? "wallet" : "tokenAccount",
      ),
      tt = addEntity(
        r,
        to,
        native || toBalance?.owner ? "wallet" : "tokenAccount",
      );
    const id = `transfer:${signature}:${index}`;
    const asset = native ? "SOL" : (mint ?? "Unknown SPL token");
    addFinding(r, {
      id,
      title:
        native && to === r.target.value
          ? "Observed incoming SOL"
          : "Documented transfer",
      description: `${units(raw, decimals)} ${native ? "SOL" : "tokens"} transferred. ${native ? "Direct native transfer; not necessarily the original source of funds." : `Token accounts: ${i.source} → ${i.destination}. ${fromBalance?.owner && toBalance?.owner ? "Owners resolved from transaction token-balance metadata." : "Unresolved endpoints remain token accounts."}`} Trade intent and common ownership are not inferred.`,
      entityIds: [fe.id, tt.id, te.id],
      source: src,
      category: native && to === r.target.value ? "funding" : "transfer",
    });
    r.relationships.push({
      id,
      from: fe.id,
      to: tt.id,
      type: native && to === r.target.value ? "funding" : "transfer",
      findingId: id,
    });
    r.transfers.push({
      id,
      from: fe.id,
      to: tt.id,
      raw,
      decimals,
      asset,
      mint,
      signature,
      timestamp: t.blockTime === null ? null : t.blockTime * 1000,
      findingId: id,
      source: src,
    });
    if (r.target.kind === "transaction") {
      for (const e of [fe, tt])
        r.relationships.push({
          id: `participant:${id}:${e.id}`,
          from: te.id,
          to: e.id,
          type: "interaction",
          findingId: id,
        });
    }
    if (r.token && mint === r.target.value) {
      for (const e of [fe, tt])
        r.relationships.push({
          id: `token-party:${id}:${e.id}`,
          from: r.root.id,
          to: e.id,
          type: "interaction",
          findingId: id,
        });
    }
  }
}
export async function solana(
  r: Snapshot,
  signal: AbortSignal,
  update: Update,
  endpoint: RpcName,
  cursor?: string,
) {
  const call = <T>(method: string, params: unknown[], schema: z.ZodType<T>) =>
    rpc(method, params, schema, signal, endpoint);
  const attempt = <T>(name: string, fn: () => Promise<T>) =>
    step(name, update, r.warnings, signal, fn);
  const a = r.target.value;
  if (r.target.kind === "transaction") {
    const tx = await attempt("Fetching transaction", () =>
      call(
        "getTransaction",
        [
          a,
          {
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 1,
            commitment: "confirmed",
          },
        ],
        transactionSchema.nullable(),
      ),
    );
    if (tx) {
      r.root = entity(r.target, "transaction", a, true);
      parseTransaction(r, tx, a);
    } else if (tx === null)
      r.warnings.push("Transaction not available from this RPC.");
    r.coverage =
      "One transaction, parsed system/SPL instructions and inner instructions. No inferred balance-delta transfers.";
    return;
  }
  const acc = await attempt("Identifying account", () =>
    call(
      "getAccountInfo",
      [a, { encoding: "jsonParsed", commitment: "confirmed" }],
      z.object({
        context: z.object({ slot: z.number() }),
        value: account.nullable(),
      }),
    ),
  );
  if (acc?.value) {
    const v = acc.value,
      parsed = Array.isArray(v.data) ? undefined : v.data.parsed;
    // shortcut: resolve Pump.fun markets only; add other terminal/pool route formats when their semantics are known.
    if (!parsed && v.owner === pumpFunProgram) {
      const marketMint = await attempt("Resolving market mint", async () => {
        const mints = new Set<string>();
        for (const programId of tokenPrograms) {
          const result = await call(
            "getTokenAccountsByOwner",
            [
              a,
              { programId },
              { encoding: "jsonParsed", commitment: "confirmed" },
            ],
            tokenAccounts,
          );
          for (const item of result.value) {
            if (Array.isArray(item.account.data)) continue;
            const info = tokenAccountInfo.safeParse(
              item.account.data.parsed.info,
            );
            if (info.success && BigInt(info.data.tokenAmount.amount) > 0n)
              mints.add(info.data.mint);
          }
        }
        return mints.size === 1 ? [...mints][0] : undefined;
      });
      if (marketMint) {
        const market = entity(addr(a), "pool", "Pump.fun market", true);
        const mint = entity(addr(marketMint), "token", marketMint, true);
        r.entities.push(market, mint);
        const id = `market-mint:${a}:${marketMint}`;
        addFinding(r, {
          id,
          title: "Market account resolved to token mint",
          description: `This Pump.fun market account owns a token account for ${marketMint}. The Padre route points to the market account, not the mint itself.`,
          entityIds: [market.id, mint.id],
          source: source(r, accountLink(a), acc.context.slot),
          category: "metadata",
        });
        r.relationships.push({
          id,
          from: market.id,
          to: mint.id,
          type: "pool",
          findingId: id,
        });
        r.target = addr(marketMint);
        await solana(r, signal, update, endpoint, cursor);
        return;
      }
      r.warnings.push(
        "Pump.fun market account did not resolve to one active token mint.",
      );
    }
    const isMint = parsed?.type === "mint";
    const isTokenAccount = parsed?.type === "account";
    const kind: Entity["kind"] = isMint
      ? "token"
      : isTokenAccount
        ? "tokenAccount"
        : v.executable
          ? "program"
          : v.owner === "11111111111111111111111111111111"
            ? "wallet"
            : "unknown";
    r.root = entity(r.target, kind, a, true);
    r.balance = Number.isSafeInteger(v.lamports)
      ? units(String(v.lamports), 9)
      : undefined;
    if (!r.balance)
      r.warnings.push(
        "SOL balance exceeds safe integer precision in this JSON response; exact balance omitted.",
      );
    addFinding(r, {
      id: `account:${a}:${acc.context.slot}`,
      title: `${kind === "unknown" ? "Account" : kind} identified`,
      description: `Owner program: ${v.owner}. ${r.balance ?? "Unavailable"} SOL. Account type comes from RPC data, not the address format.`,
      entityIds: [r.root.id],
      source: source(r, accountLink(a), acc.context.slot),
      category: "identity",
    });
    if (isMint) {
      const mint = z
        .object({
          supply: uint,
          decimals: z.number().int().min(0).max(255),
          mintAuthority: z.string().nullable(),
          freezeAuthority: z.string().nullable(),
        })
        .safeParse(parsed.info);
      if (mint.success) {
        const metadata = z
          .object({
            name: z.string().optional(),
            symbol: z.string().optional(),
            extensions: z
              .array(
                z.object({
                  extension: z.string(),
                  state: z.record(z.string(), z.unknown()),
                }),
              )
              .optional(),
          })
          .safeParse(parsed.info);
        const tokenMetadata = metadata.success
          ? metadata.data.extensions?.find(
              (extension) => extension.extension === "tokenMetadata",
            )?.state
          : undefined;
        const name = metadata.success
          ? (metadata.data.name ??
            (typeof tokenMetadata?.name === "string"
              ? tokenMetadata.name
              : undefined))
          : typeof tokenMetadata?.name === "string"
            ? tokenMetadata.name
            : undefined;
        const symbol = metadata.success
          ? (metadata.data.symbol ??
            (typeof tokenMetadata?.symbol === "string"
              ? tokenMetadata.symbol
              : undefined))
          : typeof tokenMetadata?.symbol === "string"
            ? tokenMetadata.symbol
            : undefined;
        r.root = {
          ...r.root,
          label: name && symbol ? `${name} · ${symbol}` : (name ?? symbol ?? a),
        };
        r.token = {
          ...r.token,
          ...mint.data,
          name: name ?? r.token?.name,
          symbol: symbol ?? r.token?.symbol,
          holders: r.token?.holders ?? [],
          top10: null,
          top20: null,
          top50: null,
        };
        for (const [key, title] of [
          ["mintAuthority", "Mint authority"],
          ["freezeAuthority", "Freeze authority"],
        ] as const) {
          const value = mint.data[key];
          const id = `authority:${a}:${key}:${value}`;
          const other = value ? addEntity(r, value, "authority") : undefined;
          addFinding(r, {
            id,
            title: `${title}: ${value ? "active" : "revoked"}`,
            description: value
              ? `This address holds the current ${title.toLowerCase()} permission. It is not proof of deployer identity or malicious intent.`
              : `The RPC reports no ${title.toLowerCase()}.`,
            entityIds: [r.root.id, ...(other ? [other.id] : [])],
            source: source(r, accountLink(a), acc.context.slot),
            category: "authority",
          });
          if (other)
            r.relationships.push({
              id,
              from: r.root.id,
              to: other.id,
              type: "authority",
              findingId: id,
            });
        }
        if (!cursor)
          await attempt("Fetching largest token accounts", async () => {
            const result = await call(
              "getTokenLargestAccounts",
              [a, { commitment: "confirmed" }],
              z.object({
                context: z.object({ slot: z.number() }),
                value: z.array(z.object({ address: z.string(), amount: uint })),
              }),
            );
            if (BigInt(mint.data.supply) === 0n) {
              r.warnings.push(
                "Mint supply is zero; concentration is undefined.",
              );
              return;
            }
            const rows = result.value;
            const holderAccounts = rows.length
              ? await attempt("Resolving holder wallets", () =>
                  call(
                    "getMultipleAccounts",
                    [
                      rows.map((h) => h.address),
                      { encoding: "jsonParsed", commitment: "confirmed" },
                    ],
                    z.object({
                      context: z.object({ slot: z.number() }),
                      value: z.array(account.nullable()),
                    }),
                  ),
                )
              : undefined;
            for (const [i, h] of rows.entries()) {
              const e = addEntity(r, h.address, "tokenAccount");
              const holderAccount = holderAccounts?.value[i];
              const owner =
                holderAccount && !Array.isArray(holderAccount.data) &&
                typeof holderAccount.data.parsed.info.owner === "string"
                  ? holderAccount.data.parsed.info.owner
                  : undefined;
              const ownerEntity = owner
                ? r.entities.find((item) => item.value === owner) ??
                  addEntity(r, owner, "wallet")
                : undefined;
              const id = `holder:${a}:${h.address}:${result.context.slot}`;
              const pct = percent(h.amount, mint.data.supply);
              r.token!.holders.push({
                address: h.address,
                owner,
                raw: h.amount,
                percent: pct,
                findingId: id,
              });
              addFinding(r, {
                id,
                title: `Top account #${i + 1}: ${pct.toFixed(2)}%`,
                description: `${units(h.amount, mint.data.decimals)} tokens in token account ${h.address}.${owner ? ` On-chain account owner: ${owner}.` : " Owner unavailable."} This does not establish beneficial ownership; exchange, escrow and liquidity identities are unverified.`,
                entityIds: [r.root.id, e.id, ...(ownerEntity ? [ownerEntity.id] : [])],
                source: source(
                  r,
                  `https://solscan.io/token/${a}#holders`,
                  result.context.slot,
                ),
                category: "holder",
              });
              r.relationships.push({
                id,
                from: r.root.id,
                to: e.id,
                type: "holding",
                findingId: id,
              });
              if (ownerEntity)
                r.relationships.push({
                  id: `holder-owner:${id}`,
                  from: ownerEntity.id,
                  to: e.id,
                  type: "holding",
                  findingId: id,
                });
            }
            const sum = (n: number) =>
              percent(
                rows
                  .slice(0, n)
                  .reduce((v, h) => v + BigInt(h.amount), 0n)
                  .toString(),
                mint.data.supply,
              );
            r.token!.top10 = rows.length >= 10 ? sum(10) : null;
            r.token!.top20 = rows.length >= 20 ? sum(20) : null;
          });
      } else r.warnings.push("Mint fields could not be validated.");
      r.warnings.push(
        "Largest-account RPC is limited to 20 token accounts; Top 50 and unique-owner concentration are unavailable. Complete deployer history requires an archival index.",
      );
    }
    if (isTokenAccount && typeof parsed.info.owner === "string") {
      const owner = addEntity(r, parsed.info.owner, "wallet");
      const id = `owner:${a}`;
      addFinding(r, {
        id,
        title: "Token account owner",
        description: "Owner address from parsed token-account data.",
        entityIds: [r.root.id, owner.id],
        category: "holder",
        source: source(r, accountLink(a), acc.context.slot),
      });
      r.relationships.push({
        id,
        from: owner.id,
        to: r.root.id,
        type: "holding",
        findingId: id,
      });
    }
    if (kind === "wallet" && !cursor) {
      r.holdings = [];
      for (const programId of tokenPrograms)
        await attempt(
          programId.startsWith("Tokenk")
            ? "Fetching SPL holdings"
            : "Fetching Token-2022 holdings",
          async () => {
            const result = await call(
              "getTokenAccountsByOwner",
              [
                a,
                { programId },
                { encoding: "jsonParsed", commitment: "confirmed" },
              ],
              tokenAccounts,
            );
            if (result.value.length > 50)
              r.warnings.push(
                "Only the first 50 accounts per token program are displayed.",
              );
            for (const item of result.value.slice(0, 50)) {
              if (Array.isArray(item.account.data)) continue;
              const info = tokenAccountInfo.safeParse(
                item.account.data.parsed.info,
              );
              if (!info.success) continue;
              r.holdings!.push({
                mint: info.data.mint,
                account: item.pubkey,
                raw: info.data.tokenAmount.amount,
                decimals: info.data.tokenAmount.decimals,
              });
              const e = addEntity(r, info.data.mint, "token");
              const id = `holding:${a}:${item.pubkey}`;
              addFinding(r, {
                id,
                title: "Token holding",
                description: `${units(info.data.tokenAmount.amount, info.data.tokenAmount.decimals)} tokens in account ${item.pubkey}.`,
                entityIds: [r.root.id, e.id],
                source: source(r, accountLink(item.pubkey)),
                category: "holder",
              });
              r.relationships.push({
                id,
                from: r.root.id,
                to: e.id,
                type: "holding",
                findingId: id,
              });
            }
          },
        );
    }
  } else if (acc?.value === null)
    r.warnings.push(
      "No current account exists at this address. Historical activity may still exist.",
    );
  const history = await attempt("Fetching transaction history", () =>
    call(
      "getSignaturesForAddress",
      [
        a,
        {
          limit: 8,
          ...(cursor ? { before: cursor } : {}),
          commitment: "confirmed",
        },
      ],
      z.array(
        z.object({
          signature: z.string(),
          err: z.unknown(),
          blockTime: z.number().nullable(),
        }),
      ),
    ),
  );
  if (history) {
    if (history.length === 8) r.cursor = history.at(-1)!.signature;
    r.coverage = `${history.length} signatures on this page; only successful parsed transfers create money trails. Token-account history is not automatically a complete owner history.`;
    for (let i = 0; i < history.length; i += 2) {
      signal.throwIfAborted();
      await Promise.all(
        history.slice(i, i + 2).map((h) =>
          attempt(
            `Transaction ${i + history.slice(i, i + 2).indexOf(h) + 1} of ${history.length}`,
            async () => {
              const t = await call(
                "getTransaction",
                [
                  h.signature,
                  {
                    encoding: "jsonParsed",
                    maxSupportedTransactionVersion: 1,
                    commitment: "confirmed",
                  },
                ],
                transactionSchema.nullable(),
              );
              if (t) parseTransaction(r, t, h.signature);
              else
                r.warnings.push(`Transaction ${h.signature} is unavailable.`);
            },
          ),
        ),
      );
    }
  }
}
