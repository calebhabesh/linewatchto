package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientAddressResolverTest {

    @Test
    void ignoresSpoofedForwardingHeadersFromDirectPublicClients() {
        ClientAddressResolver resolver = resolver(List.of("10.0.0.0/8"));
        MockHttpServletRequest request = requestFrom("203.0.113.20");
        request.addHeader("CF-Connecting-IP", "198.51.100.40");
        request.addHeader("X-Forwarded-For", "198.51.100.41");

        assertThat(resolver.clientAddress(request)).isEqualTo("203.0.113.20");
    }

    @Test
    void selectsNearestUntrustedAddressAndIgnoresAttackerPrependedValues() {
        ClientAddressResolver resolver = resolver(List.of("10.0.0.0/8"));
        MockHttpServletRequest request = requestFrom("10.0.0.5");
        request.addHeader("X-Forwarded-For", "192.0.2.99, 203.0.113.20");

        assertThat(resolver.clientAddress(request)).isEqualTo("203.0.113.20");
    }

    @Test
    void walksAConfiguredTrustedProxyChainFromRightToLeft() {
        ClientAddressResolver resolver = resolver(List.of("10.0.0.0/8", "198.51.100.0/24"));
        MockHttpServletRequest request = requestFrom("10.0.0.5");
        request.addHeader("X-Forwarded-For", "203.0.113.20, 198.51.100.17");

        assertThat(resolver.clientAddress(request)).isEqualTo("203.0.113.20");
    }

    @Test
    void acceptsCloudflareClientHeaderOnlyWhenNearestPublicProxyIsCloudflare() {
        ClientAddressResolver resolver = resolver(List.of("10.0.0.0/8"));
        MockHttpServletRequest request = requestFrom("10.0.0.5");
        request.addHeader("X-Forwarded-For", "198.41.128.25");
        request.addHeader("CF-Connecting-IP", "203.0.113.20");

        assertThat(resolver.clientAddress(request)).isEqualTo("203.0.113.20");
    }

    @Test
    void ignoresCloudflareClientHeaderWhenNearestPublicProxyIsNotCloudflare() {
        ClientAddressResolver resolver = resolver(List.of("10.0.0.0/8"));
        MockHttpServletRequest request = requestFrom("10.0.0.5");
        request.addHeader("X-Forwarded-For", "198.51.100.25");
        request.addHeader("CF-Connecting-IP", "203.0.113.20");

        assertThat(resolver.clientAddress(request)).isEqualTo("198.51.100.25");
    }

    @Test
    void rejectsMalformedForwardingChainsAsAWhole() {
        ClientAddressResolver resolver = resolver(List.of("10.0.0.0/8"));
        MockHttpServletRequest request = requestFrom("10.0.0.5");
        request.addHeader("X-Forwarded-For", "203.0.113.20, attacker.example");

        assertThat(resolver.clientAddress(request)).isEqualTo("10.0.0.5");
    }

    private static ClientAddressResolver resolver(List<String> cidrs) {
        TrustedProxyProperties properties = new TrustedProxyProperties();
        properties.setTrustedProxyCidrs(cidrs);
        return new ClientAddressResolver(properties);
    }

    private static MockHttpServletRequest requestFrom(String address) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(address);
        return request;
    }
}
