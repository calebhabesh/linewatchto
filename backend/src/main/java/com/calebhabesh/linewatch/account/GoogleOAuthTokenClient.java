package com.calebhabesh.linewatch.account;

public interface GoogleOAuthTokenClient {
    String exchangeCodeForIdToken(String code);
}
