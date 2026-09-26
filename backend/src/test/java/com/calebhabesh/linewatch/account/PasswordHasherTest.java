package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordHasherTest {

    @Test
    void hashesPasswordsWithBCryptAndVerifiesMatches() {
        PasswordHasher hasher = new PasswordHasher();

        String hash = hasher.hash("correct horse battery staple");

        assertThat(hash).isNotEqualTo("correct horse battery staple");
        assertThat(hash).startsWith("$2");
        assertThat(hasher.matches("correct horse battery staple", hash)).isTrue();
        assertThat(hasher.matches("wrong password", hash)).isFalse();
    }

    @Test
    void supportsCustomWorkFactorForTesting() {
        PasswordHasher fastHasher = new PasswordHasher(4);
        String hash = fastHasher.hash("test-pass");
        assertThat(hash).startsWith("$2a$04$");
        assertThat(fastHasher.matches("test-pass", hash)).isTrue();
    }
}
