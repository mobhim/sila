process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://stockflow:stockflow@localhost:5432/stockflow_test";
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
