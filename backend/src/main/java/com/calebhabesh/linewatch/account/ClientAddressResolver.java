package com.calebhabesh.linewatch.account;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class ClientAddressResolver {
    private static final int MAX_FORWARDED_HOPS = 20;
    private final List<CidrBlock> trustedProxies;
    private final List<CidrBlock> cloudflareProxies;

    public ClientAddressResolver(TrustedProxyProperties properties) {
        this.trustedProxies = properties.getTrustedProxyCidrs().stream()
            .map(CidrBlock::parse)
            .toList();
        this.cloudflareProxies = properties.getCloudflareProxyCidrs().stream()
            .map(CidrBlock::parse)
            .toList();
    }

    public String clientAddress(HttpServletRequest request) {
        InetAddress current = parseAddress(request.getRemoteAddr());
        if (current == null) {
            return "unknown";
        }
        if (!isTrusted(current)) {
            return current.getHostAddress();
        }

        List<InetAddress> forwarded = forwardedAddresses(request.getHeader("X-Forwarded-For"));
        for (int index = forwarded.size() - 1; index >= 0 && isTrusted(current); index--) {
            current = forwarded.get(index);
        }
        if (isCloudflareProxy(current)) {
            InetAddress cloudflareClient = parseAddress(request.getHeader("CF-Connecting-IP"));
            if (cloudflareClient != null) {
                return cloudflareClient.getHostAddress();
            }
        }
        return current.getHostAddress();
    }

    private boolean isTrusted(InetAddress address) {
        return trustedProxies.stream().anyMatch(block -> block.contains(address));
    }

    private boolean isCloudflareProxy(InetAddress address) {
        return cloudflareProxies.stream().anyMatch(block -> block.contains(address));
    }

    private static List<InetAddress> forwardedAddresses(String header) {
        if (header == null || header.isBlank()) {
            return List.of();
        }
        String[] values = header.split(",", -1);
        if (values.length > MAX_FORWARDED_HOPS) {
            return List.of();
        }
        List<InetAddress> result = new ArrayList<>(values.length);
        for (String value : values) {
            InetAddress address = parseAddress(value);
            if (address == null) {
                return List.of();
            }
            result.add(address);
        }
        return result;
    }

    private static InetAddress parseAddress(String value) {
        String candidate = value == null ? "" : value.trim();
        if (candidate.isEmpty() || !isNumericAddress(candidate)) {
            return null;
        }
        try {
            return InetAddress.getByName(candidate);
        } catch (UnknownHostException exception) {
            return null;
        }
    }

    private static boolean isNumericAddress(String value) {
        if (value.indexOf(':') >= 0) {
            return value.matches("[0-9A-Fa-f:.]+") && !value.contains("%");
        }
        return value.matches("[0-9.]+");
    }

    private record CidrBlock(byte[] network, int prefixLength) {
        static CidrBlock parse(String value) {
            String candidate = value == null ? "" : value.trim();
            String[] parts = candidate.split("/", -1);
            InetAddress address = parseAddress(parts[0]);
            if (address == null || parts.length > 2) {
                throw new IllegalArgumentException("Invalid trusted proxy CIDR: " + value);
            }
            int bits = address.getAddress().length * 8;
            int prefix = parts.length == 1 ? bits : parsePrefix(parts[1], value);
            if (prefix < 0 || prefix > bits) {
                throw new IllegalArgumentException("Invalid trusted proxy CIDR: " + value);
            }
            byte[] network = address.getAddress().clone();
            clearHostBits(network, prefix);
            return new CidrBlock(network, prefix);
        }

        boolean contains(InetAddress address) {
            byte[] candidate = address.getAddress().clone();
            if (candidate.length != network.length) {
                return false;
            }
            clearHostBits(candidate, prefixLength);
            return java.util.Arrays.equals(network, candidate);
        }

        private static int parsePrefix(String value, String cidr) {
            try {
                return Integer.parseInt(value);
            } catch (NumberFormatException exception) {
                throw new IllegalArgumentException("Invalid trusted proxy CIDR: " + cidr, exception);
            }
        }

        private static void clearHostBits(byte[] address, int prefix) {
            for (int bit = prefix; bit < address.length * 8; bit++) {
                int byteIndex = bit / 8;
                address[byteIndex] = (byte) (address[byteIndex] & ~(1 << (7 - (bit % 8))));
            }
        }
    }
}
