package com.calebhabesh.linewatch.account;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class PasswordHasher {
    private final BCryptPasswordEncoder encoder;

    public PasswordHasher() {
        this(12);
    }

    public PasswordHasher(int strength) {
        this.encoder = new BCryptPasswordEncoder(strength);
    }

    public String hash(String password) {
        return encoder.encode(password);
    }

    public boolean matches(String password, String hash) {
        return encoder.matches(password, hash);
    }
}
