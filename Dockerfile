# Offline submission image: assets and static Linux servers are built from source
# with `npm run docker:prepare` and committed. No registry, npm or AWS is needed.
FROM scratch
ARG TARGETARCH=amd64
COPY docker/bin/server-${TARGETARCH} /server
ADD docker/site.tar /site/
USER 65532:65532
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD ["/server", "--healthcheck"]
ENTRYPOINT ["/server"]
