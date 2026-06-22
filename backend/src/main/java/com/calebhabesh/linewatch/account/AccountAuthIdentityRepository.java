package com.calebhabesh.linewatch.account;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountAuthIdentityRepository extends JpaRepository<AccountAuthIdentityEntity, String> {
    Optional<AccountAuthIdentityEntity> findByProviderAndProviderSubject(String provider, String providerSubject);
    Optional<AccountAuthIdentityEntity> findByAccount_IdAndProvider(String accountId, String provider);
    boolean existsByAccount_IdAndProvider(String accountId, String provider);
}
