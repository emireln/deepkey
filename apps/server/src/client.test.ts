import { describe, expect, it } from "vitest";
import { clientAddress, isHttpsRequest, trustProxyEnabled } from "./client.js";

describe("client address", () => {
  it("ignores forwarded headers unless a proxy is trusted", () => {
    expect(clientAddress({ forwardedFor: "198.51.100.7", remoteAddress: "10.0.0.2" }, false)).toBe("10.0.0.2");
  });

  it("reads the first forwarded hop when a proxy is trusted", () => {
    expect(clientAddress({ forwardedFor: "198.51.100.7, 10.0.0.1", remoteAddress: "10.0.0.2" }, true)).toBe("198.51.100.7");
  });

  it("falls back to the socket address when no forwarded header is present", () => {
    expect(clientAddress({ remoteAddress: "10.0.0.2" }, true)).toBe("10.0.0.2");
  });

  it("uses one shared bucket when nothing identifies the client", () => {
    expect(clientAddress({}, false)).toBe("local");
  });
});

describe("https detection", () => {
  it("trusts x-forwarded-proto only behind a trusted proxy", () => {
    expect(isHttpsRequest({ forwardedProto: "https", url: "http://127.0.0.1:8787/" }, false)).toBe(false);
    expect(isHttpsRequest({ forwardedProto: "https", url: "http://127.0.0.1:8787/" }, true)).toBe(true);
  });

  it("uses the request URL when it is already https", () => {
    expect(isHttpsRequest({ url: "https://deepkey.example.com/" }, false)).toBe(true);
  });
});

describe("trust proxy flag", () => {
  it("is off by default and accepts the usual truthy values", () => {
    expect(trustProxyEnabled({})).toBe(false);
    expect(trustProxyEnabled({ DEEPKEY_TRUST_PROXY: "false" })).toBe(false);
    expect(trustProxyEnabled({ DEEPKEY_TRUST_PROXY: "true" })).toBe(true);
    expect(trustProxyEnabled({ DEEPKEY_TRUST_PROXY: "1" })).toBe(true);
  });
});
