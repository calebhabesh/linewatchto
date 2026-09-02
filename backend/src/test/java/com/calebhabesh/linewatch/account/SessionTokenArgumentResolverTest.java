package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.ServletWebRequest;

class SessionTokenArgumentResolverTest {
    private final SessionTokenResolver resolver = new SessionTokenResolver();
    private final SessionTokenArgumentResolver argumentResolver = new SessionTokenArgumentResolver(resolver);

    @SuppressWarnings("unused")
    private void sampleController(
        @SessionToken String optionalToken,
        @SessionToken(required = true) String requiredToken,
        String unannotated
    ) {}

    @Test
    void supportsSessionTokenAnnotation() throws Exception {
        Method method = getClass().getDeclaredMethod("sampleController", String.class, String.class, String.class);
        MethodParameter optionalParam = new MethodParameter(method, 0);
        MethodParameter requiredParam = new MethodParameter(method, 1);
        MethodParameter unannotatedParam = new MethodParameter(method, 2);

        assertThat(argumentResolver.supportsParameter(optionalParam)).isTrue();
        assertThat(argumentResolver.supportsParameter(requiredParam)).isTrue();
        assertThat(argumentResolver.supportsParameter(unannotatedParam)).isFalse();
    }

    @Test
    void resolvesTokenFromBearerHeader() throws Exception {
        Method method = getClass().getDeclaredMethod("sampleController", String.class, String.class, String.class);
        MethodParameter param = new MethodParameter(method, 0);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer my-token-abc");

        Object resolved = argumentResolver.resolveArgument(param, null, new ServletWebRequest(request), null);
        assertThat(resolved).isEqualTo("my-token-abc");
    }

    @Test
    void throwsUnauthorizedWhenRequiredAndMissing() throws Exception {
        Method method = getClass().getDeclaredMethod("sampleController", String.class, String.class, String.class);
        MethodParameter param = new MethodParameter(method, 1);

        MockHttpServletRequest request = new MockHttpServletRequest();

        assertThatThrownBy(() -> argumentResolver.resolveArgument(param, null, new ServletWebRequest(request), null))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Authentication is required.");
    }
}
