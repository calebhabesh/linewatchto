package com.calebhabesh.linewatch.account;

import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

@Component
@RequestScope
public class AccountSessionRequestContext {
    private boolean validated;
    private boolean renewalRequired;

    public void markValidated(boolean renewalRequired) {
        this.validated = true;
        this.renewalRequired = this.renewalRequired || renewalRequired;
    }

    public boolean shouldRenewCookie() {
        return validated && renewalRequired;
    }
}
