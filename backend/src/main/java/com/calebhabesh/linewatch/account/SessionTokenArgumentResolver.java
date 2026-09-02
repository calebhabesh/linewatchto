package com.calebhabesh.linewatch.account;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

@Component
public class SessionTokenArgumentResolver implements HandlerMethodArgumentResolver {
    private final SessionTokenResolver sessionTokenResolver;

    public SessionTokenArgumentResolver(SessionTokenResolver sessionTokenResolver) {
        this.sessionTokenResolver = sessionTokenResolver;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(SessionToken.class);
    }

    @Override
    public Object resolveArgument(
        MethodParameter parameter,
        ModelAndViewContainer mavContainer,
        NativeWebRequest webRequest,
        WebDataBinderFactory binderFactory
    ) {
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);
        String token = sessionTokenResolver.resolveSessionToken(request);
        SessionToken annotation = parameter.getParameterAnnotation(SessionToken.class);
        if (annotation != null && annotation.required() && (token == null || token.isBlank())) {
            throw new AccountException(HttpStatus.UNAUTHORIZED, "missing_session", "Authentication is required.");
        }
        return token;
    }
}
