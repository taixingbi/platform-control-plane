/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  experimental: {
    // Next's Server Actions CSRF check compares the browser's real
    // Origin header against the Host header the app server actually
    // sees -- and CloudFront rewrites Host to the origin's own domain
    // (the ALB's DNS name) for every request, not the public
    // *.cloudfront.net domain the browser is really talking to.
    // Confirmed live: every Server Action (e.g. logout()) was aborted
    // with "Invalid Server Actions request" until this was added.
    // Same domain as local.portal_base_url in bedrock-gateway-infra.
    serverActions: {
      allowedOrigins: ["d3ofy46m4rhywg.cloudfront.net"],
    },
  },
};

export default nextConfig;
