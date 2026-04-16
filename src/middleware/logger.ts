type Handler = (c: any, next: () => Promise<void>) => Promise<any> | any;

export function logger(): Handler {
  return async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;

    console.log(`<-- ${method} ${path}`);

    const start = Date.now();
    await next();
    const elapsed = Date.now() - start;

    console.log(`--> ${method} ${path} ${c._statusCode} ${elapsed}ms`);
  };
}
