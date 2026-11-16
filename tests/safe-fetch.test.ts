import { describe, expect, it } from "vitest";
import { isPrivateIp } from "@/lib/net/safe-fetch";

describe("isPrivateIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "169.254.169.254", "0.0.0.0", "198.18.0.1"])("blocks private v4 %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34"])("allows public v4 %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
  it.each(["::", "::1", "fe80::1", "fc00::1", "fec0::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "2002:7f00:1::"])(
    "blocks private or embedded v6 %s",
    (ip) => expect(isPrivateIp(ip)).toBe(true)
  );
  it("allows a public v6 address", () => {
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });
  it("fails closed on garbage", () => {
    expect(isPrivateIp("not-an-ip:")).toBe(true);
    expect(isPrivateIp("300.1.1.1")).toBe(true);
  });
});

import { createServer } from "node:http";
import { safeFetch } from "@/lib/net/safe-fetch";

describe("safeFetch pinning", () => {
  it("refuses a loopback address", async () => {
    const srv = createServer((_, r) => r.end("secret")).listen(0, "127.0.0.1");
    await new Promise((r) => srv.once("listening", r));
    const port = (srv.address() as { port: number }).port;
    await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    srv.close();
  });
});
