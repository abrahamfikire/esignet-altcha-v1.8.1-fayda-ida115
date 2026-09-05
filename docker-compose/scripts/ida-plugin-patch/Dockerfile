FROM abraham555/esignet@sha256:246b25f9516ac88df46e59de9f251466ab0adc799606f81e9b854fb4592190aa

USER root
COPY configure_start.sh /home/mosip/configure_start.sh
COPY patches/ /opt/esignet-patches/
COPY patch_consent_jar.sh /opt/esignet-patches/patch_consent_jar.sh
RUN chmod +x /home/mosip/configure_start.sh /opt/esignet-patches/patch_consent_jar.sh \
    && /opt/esignet-patches/patch_consent_jar.sh \
    && chown -R 1001:1001 /home/mosip/configure_start.sh /home/mosip/esignet-service.jar /opt/esignet-patches

USER 1001
