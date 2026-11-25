/**
 * DEMO DATA for development and staging only. Creates sample branches, users, products
 * and ~45 days of movements through the real ledger (so balances, averages, alerts and
 * drafts are all computed by the application). Do NOT run against production.
 */
import { PrismaClient, type Unit } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { loadActor } from "../src/server/auth/session";
import { postMovements } from "../src/server/inventory/ledger";
import { approveRequest, sendToSupplier } from "../src/server/replenishment";

const db = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || "Stockflow2026";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true to override.");
  }
  if (await db.user.count()) {
    console.log("Database already has users — skipping demo seed.");
    return;
  }
  const hash = await hashPassword(PASSWORD);
  await db.settings.update({ where: { id: 1 }, data: { businessName: "مطاعم ومقاهي النخبة" } });

  const branches = await Promise.all([
    db.branch.create({ data: { code: "RUH-01", name: "Riyadh — Olaya", nameAr: "الرياض — العليا", city: "الرياض", address: "طريق العليا، حي العليا", phone: "+966112345601" } }),
    db.branch.create({ data: { code: "JED-01", name: "Jeddah — Tahlia", nameAr: "جدة — التحلية", city: "جدة", address: "شارع التحلية", phone: "+966122345602" } }),
    db.branch.create({ data: { code: "DMM-01", name: "Dammam — Corniche", nameAr: "الدمام — الكورنيش", city: "الدمام", address: "طريق الكورنيش", phone: "+966132345603" } }),
  ]);

  const suppliers = await Promise.all([
    db.supplier.create({ data: { code: "ALMARAI", name: "شركة الألبان المتحدة", contactName: "خالد العتيبي", phone: "+966500000101", email: "orders@dairy.example", leadTimeDays: 2 } }),
    db.supplier.create({ data: { code: "COFFEE", name: "محمصة البن الذهبي", contactName: "سارة القحطاني", phone: "+966500000102", email: "sales@coffee.example", leadTimeDays: 4 } }),
    db.supplier.create({ data: { code: "PACK", name: "مؤسسة التغليف الحديث", contactName: "فهد الشمري", phone: "+966500000103", email: "pack@packaging.example", leadTimeDays: 6 } }),
  ]);

  const owner = await db.user.create({ data: { name: "عبدالله المالك", email: "owner@stockflow.local", passwordHash: hash, role: "OWNER", locale: "ar" } });
  const managers = await Promise.all(
    branches.map((b, i) =>
      db.user.create({
        data: { name: ["نورة — مديرة العليا", "ماجد — مدير التحلية", "ريم — مديرة الكورنيش"][i], email: `manager${i + 1}@stockflow.local`, passwordHash: hash, role: "MANAGER", branches: { create: { branchId: b.id, isPrimary: true } } },
      }),
    ),
  );
  for (let i = 0; i < branches.length; i++) await db.branch.update({ where: { id: branches[i].id }, data: { managerId: managers[i].id } });
  const employees = [];
  for (let i = 0; i < branches.length; i++) {
    for (let j = 0; j < 2; j++) {
      employees.push(await db.user.create({
        data: { name: `موظف ${j + 1} — ${branches[i].nameAr}`, email: `emp${i + 1}${j + 1}@stockflow.local`, passwordHash: hash, role: "EMPLOYEE", branches: { create: { branchId: branches[i].id, isPrimary: true } } },
      }));
    }
  }
  await db.user.create({ data: { name: "مندوب الألبان", email: "supplier@stockflow.local", passwordHash: hash, role: "SUPPLIER", supplierId: suppliers[0].id } });

  const cats = await Promise.all([
    db.productCategory.create({ data: { name: "Dairy", nameAr: "ألبان" } }),
    db.productCategory.create({ data: { name: "Coffee & Tea", nameAr: "قهوة وشاي" } }),
    db.productCategory.create({ data: { name: "Packaging", nameAr: "تغليف" } }),
    db.productCategory.create({ data: { name: "Cleaning", nameAr: "منظفات" } }),
  ]);

  type P = [string, string, string, Unit, number, number, number, number, number | null]; // sku, en, ar, unit, cost, cat, supplier, dailyUse, cartonOf
  const catalog: P[] = [
    ["MLK-FRS-1L", "Fresh milk 1L", "حليب طازج ١ لتر", "BOTTLE", 6.5, 0, 0, 14, 12],
    ["MLK-OAT-1L", "Oat milk 1L", "حليب الشوفان ١ لتر", "BOTTLE", 14, 0, 0, 4, 6],
    ["CRM-WHP-1L", "Whipping cream 1L", "كريمة خفق ١ لتر", "BOTTLE", 19, 0, 0, 2, 12],
    ["YGT-500", "Greek yogurt 500g", "زبادي يوناني ٥٠٠ جم", "PIECE", 9.75, 0, 0, 3, 12],
    ["CHS-SLC", "Cheddar slices 1kg", "شرائح شيدر ١ كجم", "KILOGRAM", 42, 0, 0, 1.2, null],
    ["CF-ESP-1K", "Espresso beans 1kg", "حبوب إسبريسو ١ كجم", "KILOGRAM", 95, 1, 1, 2.5, null],
    ["CF-DEC-1K", "Decaf beans 1kg", "حبوب منزوعة الكافيين ١ كجم", "KILOGRAM", 110, 1, 1, 0.4, null],
    ["CF-SAUDI-500", "Saudi coffee 500g", "قهوة سعودية ٥٠٠ جم", "PACK", 48, 1, 1, 1.5, 10],
    ["TEA-BLK-100", "Black tea 100 bags", "شاي أسود ١٠٠ كيس", "BOX", 22, 1, 1, 0.6, 24],
    ["SYR-VAN-750", "Vanilla syrup 750ml", "شراب فانيلا ٧٥٠ مل", "BOTTLE", 32, 1, 1, 0.7, 6],
    ["SYR-CAR-750", "Caramel syrup 750ml", "شراب كراميل ٧٥٠ مل", "BOTTLE", 32, 1, 1, 0.6, 6],
    ["CUP-HOT-12", "Hot cup 12oz", "كوب حار ١٢ أونصة", "PIECE", 0.38, 2, 2, 160, 1000],
    ["CUP-COLD-16", "Cold cup 16oz", "كوب بارد ١٦ أونصة", "PIECE", 0.45, 2, 2, 90, 1000],
    ["LID-HOT-12", "Hot lid 12oz", "غطاء حار ١٢ أونصة", "PIECE", 0.12, 2, 2, 150, 1000],
    ["STRW-PAPER", "Paper straws", "مصاصات ورقية", "PIECE", 0.08, 2, 2, 80, 2500],
    ["BAG-KRAFT-M", "Kraft bag medium", "كيس ورقي وسط", "PIECE", 0.55, 2, 2, 45, 500],
    ["NAP-2PLY", "Napkins 2-ply", "مناديل طبقتين", "PACK", 3.2, 2, 2, 6, 48],
    ["CLN-SANI-5L", "Sanitizer 5L", "معقم ٥ لتر", "BOTTLE", 38, 3, 2, 0.3, 4],
    ["CLN-DISH-5L", "Dish soap 5L", "سائل صحون ٥ لتر", "BOTTLE", 24, 3, 2, 0.35, 4],
    ["GLV-NIT-100", "Nitrile gloves box", "قفازات نيتريل علبة", "BOX", 18, 3, 2, 1.1, 10],
  ];

  const products = [];
  for (const [sku, en, ar, unit, cost, cat, sup, , carton] of catalog) {
    products.push(await db.product.create({
      data: {
        sku, name: en, nameAr: ar, baseUnit: unit, costPrice: cost, categoryId: cats[cat].id, defaultSupplierId: suppliers[sup].id,
        barcode: `628${String(products.length + 1).padStart(10, "0")}`,
        units: carton ? { create: [{ unit: "CARTON", factor: carton, isOrderUnit: true, barcode: `629${String(products.length + 1).padStart(10, "0")}` }] } : undefined,
      },
    }));
  }

  const ownerActor = (await loadActor(owner.id))!;
  const DAYS = Number(process.env.SEED_DAYS) || 45;
  const start = new Date(Date.now() - DAYS * 86400000);
  // Deterministic pseudo-random so the demo is reproducible.
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  for (let bi = 0; bi < branches.length; bi++) {
    const b = branches[bi];
    const scale = [1, 0.75, 0.55][bi];
    const emps = employees.filter((_, i) => Math.floor(i / 2) === bi);
    const empActors = await Promise.all(emps.map((e) => loadActor(e.id)));
    for (let pi = 0; pi < products.length; pi++) {
      const p = products[pi];
      const daily = catalog[pi][7] * scale;
      const min = Math.ceil(daily * 5);
      await db.branchInventory.create({
        data: { branchId: b.id, productId: p.id, minStock: min, reorderQty: Math.ceil(daily * 7), maxStock: Math.ceil(daily * 18) },
      });
    }
    // Opening stock — some items deliberately low to show alerts.
    await postMovements(ownerActor, {
      branchId: b.id,
      at: start,
      lines: products.map((p, pi) => ({ productId: p.id, type: "INITIAL_STOCK" as const, quantity: Math.ceil(catalog[pi][7] * scale * (pi % 7 === 3 ? 22 : 45 + rnd() * 10)) })),
    });
    for (let d = 1; d <= DAYS; d++) {
      const day = new Date(start.getTime() + d * 86400000);
      for (let pi = 0; pi < products.length; pi++) {
        const daily = catalog[pi][7] * scale;
        let q = Math.max(0, Math.round(daily * (0.6 + rnd() * 0.8) * 1000) / 1000);
        if (catalog[pi][3] === "PIECE" || catalog[pi][3] === "BOTTLE" || catalog[pi][3] === "BOX" || catalog[pi][3] === "PACK") q = Math.round(q);
        if (q <= 0) continue;
        const inv = await db.branchInventory.findUniqueOrThrow({ where: { branchId_productId: { branchId: b.id, productId: products[pi].id } } });
        const avail = Number(inv.quantity);
        const actor = empActors[(d + pi) % empActors.length]!;
        const at = new Date(day.getTime() + (8 + rnd() * 12) * 3600000);
        if (avail - q < 0) continue;
        await postMovements(actor, { branchId: b.id, at, lines: [{ productId: products[pi].id, type: rnd() < 0.85 ? "CONSUMPTION" : "WITHDRAWAL", quantity: q }] });
        // Weekly receipts restore most items (but not the deliberately low ones).
        if (d % 7 === 0 && pi % 7 !== 3 && avail - q < Number(inv.maxStock) * 0.6) {
          await postMovements(ownerActor, { branchId: b.id, at: new Date(at.getTime() + 3600000), lines: [{ productId: products[pi].id, type: "STOCK_RECEIPT", quantity: Math.ceil(Number(inv.maxStock) - (avail - q)), reason: "Weekly delivery" }] });
        }
      }
    }
  }

  // Move one auto draft forward so the supplier portal has something to show.
  const draft = await db.replenishmentRequest.findFirst({ where: { supplierId: suppliers[0].id, status: "DRAFT" } });
  if (draft) {
    const mgr = await db.branchUser.findFirst({ where: { branchId: draft.branchId, user: { role: "MANAGER" } } });
    const mgrActor = mgr ? await loadActor(mgr.userId) : ownerActor;
    await approveRequest(mgrActor!, draft.id, "Demo approval");
    await sendToSupplier(mgrActor!, draft.id);
  }

  console.log("Demo data ready. Sign in with any of these (password: %s):", PASSWORD);
  console.log("  owner@stockflow.local, manager1@stockflow.local, emp11@stockflow.local, supplier@stockflow.local");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
