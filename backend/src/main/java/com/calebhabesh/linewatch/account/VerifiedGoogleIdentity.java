package com.calebhabesh.linewatch.account;

public record VerifiedGoogleIdentity(
    String subject,
    String email,
    boolean emailVerified,
    String displayName
) {}
