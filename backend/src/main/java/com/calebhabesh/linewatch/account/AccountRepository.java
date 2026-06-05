package com.calebhabesh.linewatch.account;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<AccountEntity, String> {
    boolean existsByEmail(String email);
    Optional<AccountEntity> findByEmail(String email);
}
