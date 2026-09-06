import { appRouter } from '/home/ubuntu/cyberjocx-web/server/routers.ts';
console.log(Object.keys(appRouter._def));
console.log(Object.keys(appRouter._def.record ?? {}));
console.log(Object.keys(appRouter._def.procedures ?? {}).slice(0, 20));
